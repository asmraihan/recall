"use client";

import { useState, lazy, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BookOpen, GraduationCap, RefreshCw, AlertCircle, PenLine } from "lucide-react";
import { StartSessionDialog } from "@/components/learn/start-session-dialog";
import { RecentSessions } from "@/components/learn/recent-sessions";

const LearningStats = lazy(() => import("@/components/learn/learning-stats").then(mod => ({ default: mod.LearningStats })));


export default function LearnPage() {
  const [activeTab, setActiveTab] = useState("overview");


  // Fetch learning progress stats (essential, load immediately)
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["learning-stats"],
    queryFn: async () => {
      const response = await fetch("/api/learn/stats");
      if (!response.ok) throw new Error("Failed to fetch learning stats");
      return response.json();
    },
    staleTime: 30000, // Keep data fresh for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  const dueWordsCount = stats?.dueWords ?? 0;
  const learningStreak = stats?.learningStreak ?? 0;
  const accuracy = stats?.averageAccuracy ?? 0;

  if (isLoadingStats) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Learn</h1>
          <p className="text-muted-foreground">
            Master vocabulary with our spaced repetition system
          </p>
        </div>
        <StartSessionDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>
            Start a new learning session
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">

          <StartSessionDialog mode="new">
            <Button variant="outline" className="justify-start w-full cursor-pointer">
              <BookOpen className="mr-2 h-4 w-4" />
              Learn New Words
            </Button>
          </StartSessionDialog>

          <StartSessionDialog mode="mistakes">
            <Button variant="outline" className="justify-start w-full cursor-pointer">
              <AlertCircle className="mr-2 h-4 w-4" />
              Practice Mistakes
            </Button>
          </StartSessionDialog>

          {/* <StartSessionDialog mode="randomized">
            <Button variant="outline" className="justify-start w-full cursor-pointer">
              <RefreshCw className="mr-2 h-4 w-4" />
              Randomized Session
            </Button>
          </StartSessionDialog> */}

          <StartSessionDialog mode="review">
            <Button variant="outline" className="justify-start w-full cursor-pointer">
              <RefreshCw className="mr-2 h-4 w-4" />
              Review Due Words
            </Button>
          </StartSessionDialog>

          {/* <StartSessionDialog mode="important" key="important-words">
            <Button variant="outline" className="justify-start w-full cursor-pointer">
              <Star className="mr-2 h-4 w-4" />
              Practice Important Words
            </Button>
          </StartSessionDialog> */}

          <StartSessionDialog mode="custom">
            <Button variant="outline" className="justify-start w-full cursor-pointer">
              <PenLine className="mr-2 h-4 w-4" />
              Custom Session
            </Button>
          </StartSessionDialog>

        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap md:flex-nowrap gap-2 md:gap-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Words Mastered</CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.masteredWords || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Out of {stats?.totalWords || 0} words
                </p>
                <Progress
                  value={(stats?.masteredWords / stats?.totalWords) * 100 || 0}
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Due for Review</CardTitle>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dueWordsCount}</div>
                <p className="text-xs text-muted-foreground">
                  Words ready for review
                </p>
                {/* Show due words list if available and not loading */}
                {/* {dueWords && dueWords.length > 0 && (
                  <ul className="mt-2 text-xs text-muted-foreground max-h-32 overflow-y-auto">
                    {dueWords.slice(0, 8).map((word) => (
                      <li key={word.id} className="truncate">{word.mainWord} ({word.translation1 || "?"})</li>
                    ))}
                    {dueWords.length > 8 && (
                      <li className="italic">...and {dueWords.length - 8} more</li>
                    )}
                  </ul>
                )} */}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Learning Streak</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{learningStreak}</div>
                <p className="text-xs text-muted-foreground">
                  Days of consistent learning
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Accuracy</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {accuracy ? `${Math.round(accuracy * 100)}%` : "0%"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Overall answer accuracy
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="">
            <Card>
              <CardHeader>
                <CardTitle>Recent Sessions</CardTitle>
                <CardDescription>
                  Your latest learning activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecentSessions />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="progress">
          <Suspense fallback={<div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
            <LearningStats />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Learning Sessions</CardTitle>
              <CardDescription>
                View and manage your learning sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecentSessions />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}