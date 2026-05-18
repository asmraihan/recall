"use client";

import { useEffect, useState, useOptimistic, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Star, Undo, Volume2 } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useTranslation } from "@/hooks/use-translation-cache";

interface Word {
  id: string;
  mainWord: string;
  translation1: string | null;
  translation2: string | null;
  section: string;
  notes: string | null;
  important?: boolean;
  exampleSentence: string | null;
}

interface CardState {
  word: Word;
  answered: boolean;
  isCorrect?: boolean;
}

export default function LearningSessionPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<Word[]>([]);
  const [cards, setCards] = useState<CardState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Remove local important state, rely on word.important
  const [showContinueHint, setShowContinueHint] = useState(false);
  const [dragFeedback, setDragFeedback] = useState<null | 'plus' | 'minus'>(null);
  const [lastUnansweredIndex, setLastUnansweredIndex] = useState<number>(0);
  const [direction, setDirection] = useState("main_to_trans1");
  const [sessionType, setSessionType] = useState<string>("");
  const [sections, setSections] = useState<number[]>([]);

  const x = useMotionValue(0);
  const cardRotate = useTransform(x, [-300, 0, 300], [-45, 0, 45]);

  const leftIndicatorProgress = useTransform(x, [-300, 0], [1, 0]);
  const rightIndicatorProgress = useTransform(x, [0, 300], [0, 1]);

  // Hook must be called at top level before any early returns
  // Note: we pass null when cards are empty to avoid hook order violations
  const { translation: exampleSentenceTranslation, loading: sentenceTranslationLoading } = useTranslation(
    cards.length > 0 && currentIndex < cards.length ? cards[currentIndex]?.word.exampleSentence || null : null,
    { targetLanguage: 'en' }
  );

  // TTS state
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudio, setTtsAudio] = useState<HTMLAudioElement | null>(null);
  const [ttsVoices, setTtsVoices] = useState<any[]>([]);
  const [ttsVoice, setTtsVoice] = useState<string>("de-DE-AmalaNeural");
  const [preferredVoice, setPreferredVoice] = useState<string>("de-DE-AmalaNeural");
  let longPressTimer: NodeJS.Timeout | null = null;

  // Fetch user voice preference on mount
  useEffect(() => {
    const fetchVoicePreference = async () => {
      try {
        const res = await fetch("/api/user/voice");
        if (res.ok) {
          const data = await res.json();
          setPreferredVoice(data.preferredVoice || "de-DE-AmalaNeural");
        }
      } catch {
        // fallback to default
      }
    };
    fetchVoicePreference();
  }, []);

  // Fetch voices for picker (on demand)
  const fetchVoices = async () => {
    if (ttsVoices.length > 0) return;
    try {
      const res = await fetch("/api/tts");
      if (res.ok) {
        const voices = await res.json();
        setTtsVoices(voices);
      }
    } catch { }
  };

  async function playTTS(text: string) {
    setTtsLoading(true);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: preferredVoice }),
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const data = await response.json();

      if (ttsAudio) {
        ttsAudio.pause();
        ttsAudio.src = '';
      }

      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      setTtsAudio(audio);
      await audio.play();
    } catch {
      toast.error("TTS playback failed");
    } finally {
      setTtsLoading(false);
    }
  }

  // Optimistic map for `important` per-word
  const [optimisticImportant, dispatchOptimistic] = useOptimistic<Record<string, boolean>, { type: "set"; id: string; value: boolean }>(
    {},
    (state, action) => ({ ...state, [action.id]: action.value })
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function fetchSession() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/learn/sessions/${sessionId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch session data");
        }
        const data = await res.json();
        const fetchedWords = data.words || [];
        // console.log(fetchedWords , "fetchedWords");
        // Use direction from session or default, will be in new format from API
        const sessionDirection = data.session?.direction || "main_to_trans1";
        setDirection(sessionDirection);
        setSessionType(data.session?.sessionType || "");
        setSections(data.session?.sections || []);
        setWords(fetchedWords);
        setCards(fetchedWords.map((word: Word & { answeredAt?: string | null, isCorrect?: boolean | null }) => ({
          word,
          answered: !!word.answeredAt,
          isCorrect: word.isCorrect ?? undefined
        })));
        // Calculate correct/incorrect counts from DB data
        const correct = fetchedWords.filter((w: { isCorrect?: boolean }) => w.isCorrect === true).length;
        const incorrect = fetchedWords.filter((w: { isCorrect?: boolean }) => w.isCorrect === false).length;
        setCorrectCount(correct);
        setIncorrectCount(incorrect);
        // Set currentIndex to first unanswered card, or last card if all answered
        const firstUnanswered = fetchedWords.findIndex((w: { answeredAt?: string | null }) => !w.answeredAt);
        setCurrentIndex(firstUnanswered === -1 ? fetchedWords.length - 1 : firstUnanswered);
        setLastUnansweredIndex(firstUnanswered === -1 ? fetchedWords.length - 1 : firstUnanswered);

        // No need to set important state, use word.important directly
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    if (sessionId) fetchSession();
  }, [sessionId]);

  const handleDragEnd = async (_: unknown, info: { offset: { x: number }, velocity: { x: number } }) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const direction = offset < 0 ? "left" : "right";

    setDragFeedback(null);

    if (showContinueHint) setShowContinueHint(false);

    // If on the last unanswered card, allow answering
    if (currentIndex === lastUnansweredIndex && !currentCard.answered) {
      if (Math.abs(offset) > 75 || Math.abs(velocity) > 500) {
        const isCorrect = direction === "left";
        await handleCardAnswer(isCorrect);
      }
    } else if (currentIndex < lastUnansweredIndex) {
      // If on a previous card, swiping returns to last unanswered card (no answer, no DB call)
      if (Math.abs(offset) > 75 || Math.abs(velocity) > 500) {
        setCurrentIndex(lastUnansweredIndex);
        setIsFlipped(false);
        setShowContinueHint(false);
      }
    }
  };

  const toggleFlip = () => {
    // Allow flipping if not answered OR if not on the last unanswered card (i.e., viewing previous cards)
    if (!currentCard.answered || currentIndex < lastUnansweredIndex) {
      setIsFlipped(prev => !prev);
    }
  };

  const handleCardAnswer = async (isCorrect: boolean) => {
    // Prevent reevaluation: do not allow answering already answered cards
    if (currentCard.answered) return;

    // Optimistically update UI
    setCards(prev => {
      const newCards = [...prev];
      newCards[currentIndex] = {
        ...newCards[currentIndex],
        answered: true,
        isCorrect
      };
      return newCards;
    });
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
    } else {
      setIncorrectCount(prev => prev + 1);
    }

    // Find the next unanswered card index after answering (use callback to get latest state)
    setTimeout(() => {
      setCards(prevCards => {
        const nextUnanswered = prevCards.findIndex((c, idx) => idx > currentIndex && !c.answered);
        if (nextUnanswered === -1) {
          setCompleted(true);
          setCurrentIndex(prevCards.length - 1);
          setLastUnansweredIndex(prevCards.length - 1);
        } else {
          setCurrentIndex(nextUnanswered);
          setLastUnansweredIndex(nextUnanswered);
          setIsFlipped(false);
        }
        return prevCards;
      });
    }, 250);

    // Fire-and-forget API call
    fetch(`/api/learn/sessions/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: currentCard.word.id, isCorrect }),
    }).then(res => {
      if (!res.ok) throw new Error();
    }).catch(() => {
      toast.error("Failed to save answer. Please check your connection.");
      // Optionally: add retry logic or mark as unsynced for later sync
    });
  };

  const handleMarkImportant = async (word: Word) => {
    const prevValue = !!word.important;
    const newValue = !prevValue;

    // snapshot previous state to rollback if needed
    const prevWords = words;
    const prevCards = cards;

    // apply optimistic updates
    startTransition(() => {
      dispatchOptimistic({ type: "set", id: word.id, value: newValue });
      setWords((w) => w.map(x => x.id === word.id ? { ...x, important: newValue } : x));
      setCards((c) => c.map(card => card.word.id === word.id ? { ...card, word: { ...card.word, important: newValue } } : card));
    });

    try {
      const res = await fetch(`/api/learn/words/${word.id}/important`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ important: newValue }),
      });
      if (!res.ok) throw new Error("Failed to update important status");
      toast.success(newValue ? "Marked as important" : "Unmarked as important");
    } catch (err) {
      // rollback optimistic updates
      startTransition(() => {
        dispatchOptimistic({ type: "set", id: word.id, value: prevValue });
        setWords(prevWords);
        setCards(prevCards);
      });
      toast.error("Failed to update important status");
    }
  };

  const goToPreviousCard = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => {
        const newIndex = prev - 1;
        setIsFlipped(false);
        setShowContinueHint(true);
        // Do NOT reset answered/isCorrect state here!
        return newIndex;
      });
    }
  };

  // Show drag feedback on drag
  const handleDrag = (_: unknown, info: { offset: { x: number } }) => {
    if (!currentCard.answered) {
      if (info.offset.x < -75) setDragFeedback('plus');
      else if (info.offset.x > 75) setDragFeedback('minus');
      else setDragFeedback(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (!words.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <p className="text-muted-foreground mb-4">No words found for this session.</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Session Complete!</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <div className="text-2xl font-bold mb-4">Great job!</div>
            <div className="flex gap-4 mb-4">
              <div className="text-green-600">✓ {correctCount} correct</div>
              <div className="text-red-600">✗ {incorrectCount} incorrect</div>
            </div>
            <Button onClick={() => router.push('/dashboard')}>Back to Learn</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  console.log(currentCard)

  return (
    <div className="flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle always-visible left/right background overlays */}
      <div className="absolute left-0 top-0 h-full w-1/2 bg-green-100/20 dark:bg-green-500/2 pointer-events-none z-0 rounded-l-2xl" />
      <div className="absolute right-0 top-0 h-full w-1/2 bg-red-100/20 dark:bg-red-500/2 pointer-events-none z-0 rounded-r-2xl" />
      {/* Main content stays above overlays */}
      <div className="relative z-10 w-full flex flex-col items-center">
        {/* Session Details */}
        <div className="w-full max-w-md mb-2 flex flex-col gap-1">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-semibold text-xs">
              {sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} Session
            </span>

            {sections.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                Section{sections.length > 1 ? 's' : ''}: {sections.join(", ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">
              Progress: {correctCount + incorrectCount} / {words.length} words
            </div>
          </div>
        </div>

        <motion.div
          className="w-full max-w-md relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              className={clsx(
                "card-container",
                dragFeedback === 'plus' && 'border-3 border-green-300 rounded-2xl',
                dragFeedback === 'minus' && 'border-3 border-red-300 rounded-2xl'
              )}
              style={{ x, rotate: cardRotate, opacity: 1 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={handleDragEnd}
              onDrag={handleDrag}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              whileTap={{ cursor: currentIndex === lastUnansweredIndex && !currentCard.answered ? "grabbing" : "grab" }}
            >
              <Card
                className={clsx(
                  "relative cursor-grab select-none transform-gpu card-content perspective-1000",
                  "border-2 overflow-hidden hover:cursor-grab active:cursor-grabbing shadow-xl",
                  "transition-transform duration-500",
                  "min-h-[420px] md:min-h-[440px] lg:min-h-[480px]"
                )}
                onClick={toggleFlip}
                style={{ opacity: 1 }}
              >
                {/* Star Button and Progress Pills (not rotating) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkImportant(currentCard.word);
                  }}
                  className="absolute top-4 right-4 z-10 cursor-pointer"
                >
                    <Star
                      className={clsx(
                        "h-6 w-6 transition-colors",
                        (optimisticImportant[currentCard.word.id] ?? currentCard.word.important) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      )}
                  />
                </button>
                <div className="absolute top-4 left-4 flex gap-2 min-w-[110px]">
                  {dragFeedback === 'plus' ? (
                    <motion.div
                      key="plus"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700 font-bold"
                    >
                      +1
                    </motion.div>
                  ) : dragFeedback === 'minus' ? (
                    <motion.div
                      key="minus"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700 font-bold"
                    >
                      -1
                    </motion.div>
                  ) : (
                    <>
                      <div className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                        ✓ {correctCount}
                      </div>
                      <div className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">
                        ✗ {incorrectCount}
                      </div>
                    </>
                  )}
                </div>

                {/* Rotating Content */}
                <motion.div
                  className="relative w-full h-full"
                  style={{
                    perspective: 1000,
                    minHeight: 300, // increased from 240
                  }}
                >
                  {/* Card Front */}
                  <motion.div
                    className="absolute inset-0 w-full h-full"
                    style={{
                      rotateX: isFlipped ? 180 : 0,
                      opacity: isFlipped ? 0 : 1,
                      backfaceVisibility: "hidden",
                      transition: "transform 0.5s, opacity 0.3s"
                    }}
                    animate={{ rotateX: isFlipped ? 180 : 0, opacity: isFlipped ? 0 : 1 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <CardContent className="mt-8 md:mt-0 p-6 flex flex-col items-center justify-center min-h-[280px] md:min-h-[340px] lg:min-h-[400px]">
                      <div className="text-2xl font-bold">
                        {direction === "main_to_trans1" && currentCard.word.mainWord}
                        {direction === "trans1_to_main" && currentCard.word.translation1}
                        {direction === "main_to_trans2" && currentCard.word.mainWord}
                        {direction === "trans2_to_main" && currentCard.word.translation2}
                      </div>
                    </CardContent>
                  </motion.div>
                  {/* Card Back */}
                  <motion.div
                    className="absolute inset-0 w-full h-full"
                    style={{
                      rotateX: isFlipped ? 0 : -180,
                      opacity: isFlipped ? 1 : 0,
                      backfaceVisibility: "hidden",
                      transition: "transform 0.5s, opacity 0.3s"
                    }}
                    animate={{ rotateX: isFlipped ? 0 : -180, opacity: isFlipped ? 1 : 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <CardContent className="p-6 flex flex-col items-center justify-center min-h-[280px] md:min-h-[340px] lg:min-h-[400px]">
                      {direction === "main_to_trans1" && (
                        <>
                          <p className="text-2xl font-bold mb-4">{currentCard.word.translation1}</p>
                          {currentCard.word.translation2 && (
                            <p className="text-lg text-muted-foreground">{currentCard.word.translation2}</p>
                          )}
                        </>
                      )}
                      {direction === "trans1_to_main" && (
                        <>
                          <p className="text-2xl font-bold mb-4">{currentCard.word.mainWord}</p>
                          {currentCard.word.translation2 && (
                            <p className="text-lg text-muted-foreground">{currentCard.word.translation2}</p>
                          )}
                        </>
                      )}
                      {direction === "main_to_trans2" && (
                        <>
                          <p className="text-2xl font-bold mb-4">{currentCard.word.translation2}</p>
                          {currentCard.word.translation1 && (
                            <p className="text-lg text-muted-foreground">{currentCard.word.translation1}</p>
                          )}
                        </>
                      )}
                      {direction === "trans2_to_main" && (
                        <>
                          <p className="text-2xl font-bold mb-4">{currentCard.word.mainWord}</p>
                          {currentCard.word.translation1 && (
                            <p className="text-lg text-muted-foreground">{currentCard.word.translation1}</p>
                          )}
                        </>
                      )}

                      {currentCard.word.exampleSentence && (
                        <div className="text-sm text-muted-foreground flex flex-col items-center gap-2 mt-6 px-4">
                          <em className="text-center">&quot;{currentCard.word.exampleSentence}&quot;</em>
                          {exampleSentenceTranslation && (
                            <div className="text-xs italic border-l-2 border-muted pl-2 text-center">
                              {exampleSentenceTranslation}
                            </div>
                          )}
                          {sentenceTranslationLoading && (
                            <div className="text-xs">Translating...</div>
                          )}
                        </div>
                      )}

                      {currentCard.word.notes && (
                        <p className="text-sm text-muted-foreground mt-6 text-center">N.B. {currentCard.word.notes}</p>
                      )}
                    </CardContent>
                  </motion.div>
                </motion.div>

                {/* Swipe progress indicators (not rotating) */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ opacity: leftIndicatorProgress }}
                >
                  <div className="absolute inset-0 bg-green-500/20" />
                  {/* <div className="absolute left-1/4 bottom-1/3 -translate-y-1/2 text-green-500 text-lg font-bold">
                    Know
                  </div> */}
                </motion.div>
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ opacity: rightIndicatorProgress }}
                >
                  <div className="absolute inset-0 bg-red-500/20" />
                  {/* <div className="absolute right-1/4  bottom-1/3 -translate-y-1/2 text-red-500 text-lg font-bold">
                    Don&apos;t Know
                  </div> */}
                </motion.div>

                {/* TTS Button - show for any valid direction */}
                {(direction === "main_to_trans1" || direction === "trans1_to_main" || direction === "main_to_trans2" || direction === "trans2_to_main") && (
                  <button
                    className="absolute bottom-4 right-4 z-20 bg-background/90 text-foreground rounded-full p-2 shadow-lg border hover:bg-primary/10 transition"
                    disabled={ttsLoading}
                    onClick={e => {
                      e.stopPropagation();
                      let text = "";
                      text = currentCard.word.mainWord + " , " + currentCard.word.exampleSentence;
                      playTTS(text);
                    }}
                    title="Play word TTS"
                  >
                    <Volume2 className={clsx("h-6 w-6", ttsLoading && "animate-pulse")} />
                  </button>
                )}
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* Mobile Previous Button */}
          {currentIndex > 0 && (
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                goToPreviousCard();
              }}
              className="absolute -left-4 -bottom-4 z-10 bg-background shadow-md cursor-pointer"
            >
              <Undo className="h-4 w-4" />
            </Button>
          )}
        </motion.div>

        {/* Desktop Navigation */}
        {/* REMOVE DESKTOP NAVIGATION BUTTONS */}

        {/* Mobile Instructions */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          {showContinueHint ? (
            <span className="text-blue-500">Drag card in any direction to continue learning.</span>
          ) : currentIndex < lastUnansweredIndex ? (
            <span className="text-blue-500">Drag to return to current card</span>
          ) : (
            "Tap to flip • Drag left for \"Know\" • Drag right for \"Don't Know\""
          )}
        </p>
      </div>
    </div>
  );
}