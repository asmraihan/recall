"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { VoiceCombobox } from "@/components/ui/voice-combobox"
import { Progress } from "@/components/ui/progress"
import { Play, Pause, Square, Download } from "lucide-react"
import { toast } from "sonner"

interface Voice {
  Name: string
  ShortName: string
  Gender: string
  Locale: string
  FriendlyName: string
}

export default function TTSPage() {
  const [text, setText] = useState("")
  const [voices, setVoices] = useState<Voice[]>([])
  const [selectedVoice, setSelectedVoice] = useState("")
  const [preferredVoice, setPreferredVoice] = useState("")
  const [speed, setSpeed] = useState([-20]) // backend default rate -20%
  const [volume, setVolume] = useState([20]) // backend default volume +20%
  const [pitch, setPitch] = useState([-10]) // backend default pitch -10Hz
  const [isLoadingVoices, setIsLoadingVoices] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    fetchVoices()
    fetchPreferredVoice()
  }, [])

  useEffect(() => {
    if (voices.length && !selectedVoice) {
      const preferred = voices.find((voice) => voice.ShortName === preferredVoice)
      setSelectedVoice(preferred?.ShortName ?? voices[0].ShortName)
    }
  }, [voices, preferredVoice, selectedVoice])

  const fetchVoices = async () => {
    try {
      const response = await fetch("/api/tts")
      if (response.ok) {
        const data = await response.json()
        if (data && Array.isArray(data.voices)) {
          setVoices(data.voices)
        } else {
          toast.error("Invalid voices data received")
        }
      } else {
        toast.error("Failed to load voices")
      }
    } catch (error) {
      toast.error("Error loading voices")
    } finally {
      setIsLoadingVoices(false)
    }
  }

  const fetchPreferredVoice = async () => {
    try {
      const response = await fetch("/api/user/voice")
      if (response.ok) {
        const data = await response.json()
        setPreferredVoice(data.preferredVoice || "")
      }
    } catch (error) {
      console.error("Failed to fetch preferred voice:", error)
    }
  }

  const handlePlay = async () => {
    if (!text.trim() || !selectedVoice) {
      toast.error("Please enter text and select a voice")
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.trim(),
          voice: selectedVoice,
          rate: speed[0],
          volume: `${volume[0] >= 0 ? "+" : ""}${volume[0]}%`,
          pitch: `${pitch[0] >= 0 ? "+" : ""}${pitch[0]}Hz`,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const url = `data:audio/mp3;base64,${data.audio}`
        setAudioUrl(url)
        if (audioRef.current) {
          audioRef.current.src = url
          await audioRef.current.play()
          setIsPlaying(true)
        }
      } else {
        toast.error("Failed to generate audio")
      }
    } catch (error) {
      toast.error("Error generating audio")
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      setProgress(0)
    }
  }

  const handleSave = () => {
    if (audioUrl) {
      const a = document.createElement("a")
      a.href = audioUrl
      a.download = "tts_audio.mp3"
      a.click()
      toast.success("Audio saved")
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      const updateProgress = () => {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
      const handleEnded = () => {
        setIsPlaying(false)
        setProgress(0)
      }
      audio.addEventListener("timeupdate", updateProgress)
      audio.addEventListener("ended", handleEnded)
      return () => {
        audio.removeEventListener("timeupdate", updateProgress)
        audio.removeEventListener("ended", handleEnded)
      }
    }
  }, [audioUrl])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Text-to-Speech</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className=" mb-2" htmlFor="text">Text to speak</Label>
            <Textarea
              id="text"
              placeholder="Enter the text you want to convert to speech..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <Label>Voice</Label>
            <VoiceCombobox
              voices={voices}
              value={selectedVoice}
              onSelect={setSelectedVoice}
              isLoading={isLoadingVoices}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label>Speed: {speed[0]}</Label>
              <Slider
                value={speed}
                onValueChange={setSpeed}
                min={-100}
                max={100}
                step={1}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Volume: {volume[0]}%</Label>
              <Slider
                value={volume}
                onValueChange={setVolume}
                min={-100}
                max={100}
                step={1}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Pitch: {pitch[0]}Hz</Label>
              <Slider
                value={pitch}
                onValueChange={setPitch}
                min={-100}
                max={100}
                step={1}
                className="mt-2"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button onClick={handlePlay} disabled={isGenerating || !text.trim() || !selectedVoice}>
              {isGenerating ? "Generating..." : <><Play className="w-4 h-4 mr-2" /> Play</>}
            </Button>
            {audioUrl && (
              <>
                <Button onClick={isPlaying ? handlePause : () => audioRef.current?.play()} variant="outline">
                  {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  {isPlaying ? "Pause" : "Resume"}
                </Button>
                <Button onClick={handleStop} variant="outline">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
                <Button onClick={handleSave} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </>
            )}
          </div>

          {audioUrl && (
            <div>
              <Label>Playback Progress</Label>
              <Progress value={progress} className="mt-2" />
            </div>
          )}
        </CardContent>
      </Card>

      <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
    </div>
  )
} 