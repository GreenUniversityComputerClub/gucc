"use client";

import { RESIZE_AVATAR } from "@/app/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAvailableYears, type Executive } from "@/app/executives/util";
import executivesData from "@/data/executives.json";
import {
  BookOpen,
  Building2,
  Camera,
  Code2,
  Crown,
  GraduationCap,
  Loader2,
  Save,
  UserCog,
  Users,
  ZoomIn,
  ZoomOut,
  HandCoins,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function ExecutivesPage() {
  const availableYears = getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );
  const [activeYear, setActiveYear] = useState(availableYears[0]);
  const [isResizeMode, setIsResizeMode] = useState(RESIZE_AVATAR);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentYearData = executivesData.find(
    (exec) => exec.year === activeYear
  );

  // Simple admin check - in a real app, this would use authentication
  const checkAdminStatus = () => {
    const password = prompt("Enter admin password:");
    if (password === "gucc-admin") {
      // This is just for demo purposes
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const toggleResizeMode = () => {
    if (!isAdmin && !checkAdminStatus()) {
      return;
    }
    setIsResizeMode(!isResizeMode);
  };

  // Function to save all changes to executives.json
  const saveAllChanges = async () => {
    if (!isAdmin && !checkAdminStatus()) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/save-all-changes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save changes");
      }

      alert("All changes saved successfully!");
    } catch (error) {
      console.error("Error saving changes:", error);
      alert(
        `Error saving changes: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentYearData) {
    return (
      <div className="container py-12">
        No data available for the selected year.
      </div>
    );
  }

  return (
    <div className="container py-4 md:py-8">
      {isAdmin && (
        <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-center justify-between">
            <div className="text-sm text-yellow-700">
              <span className="font-medium">Admin Mode</span> - You can{" "}
              {isResizeMode ? "disable" : "enable"} avatar resize mode
            </div>
            <Button
              variant={isResizeMode ? "destructive" : "outline"}
              size="sm"
              onClick={toggleResizeMode}
            >
              {isResizeMode ? "Disable Resize Mode" : "Enable Resize Mode"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          {isResizeMode && (
            <Button
              variant="default"
              onClick={saveAllChanges}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save All Changes
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <p className="text-center mx-auto max-w-[700px] text-muted-foreground md:text-lg">
        Meet the dedicated team behind GUCC
      </p>

      <Tabs
        defaultValue={activeYear}
        className="mt-8"
        onValueChange={setActiveYear}
      >
        <div className="flex justify-center mb-4">
          <TabsList>
            {availableYears.map((year) => (
              <TabsTrigger key={year} value={year}>
                {year}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {availableYears.map((year) => {
          const yearData = executivesData.find((exec) => exec.year === year);
          const facultyMembers = yearData?.facultyMembers || [];

          return (
            <TabsContent key={year} value={year}>
              {facultyMembers.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <GraduationCap className="h-6 w-6 text-primary" />
                    Faculty Advisors
                  </h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {facultyMembers.map((faculty, index) => (
                      <ExecutiveCard
                        key={index}
                        executive={faculty}
                        isResizeMode={isResizeMode}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  Student Executives
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {(yearData?.studentExecutives || []).map(
                    (executive, index) => (
                      <ExecutiveCard
                        key={index}
                        executive={executive}
                        isResizeMode={isResizeMode}
                      />
                    )
                  )}
                </div>
              </section>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function ExecutiveCard({
  executive,
  isResizeMode,
}: {
  executive: Executive;
  isResizeMode: boolean;
}) {
  const [position, setPosition] = useState(
    executive.avatarPosition || { x: 0, y: 0 }
  );
  const [scale, setScale] = useState(executive.avatarScale || 1);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isResizeMode) return;
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !isResizeMode) return;

    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;

    setPosition((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    setStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const saveAvatarSettings = async () => {
    if (!isResizeMode) return;

    try {
      const response = await fetch("/api/save-avatar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: executive.studentId,
          avatarPosition: position,
          avatarScale: scale,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save avatar settings");
      }

      const data = await response.json();
      alert(`Avatar settings for ${executive.name} saved successfully!`);
    } catch (error) {
      console.error("Error saving avatar settings:", error);
      alert(
        `Error saving avatar settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  useEffect(() => {
    if (isResizeMode) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, startPos, isResizeMode]);

  return (
    <div>
      <Card className="relative overflow-hidden overflow-top-block group min-h-[7.5rem] h-auto">
        <div className="absolute inset-0" />
        <div className="relative">
          <CardHeader className="flex flex-row items-center gap-4 relative">
            <div
              ref={imageRef}
              className={`absolute -right-8 -top-4 w-40 h-40 opacity-100 group-hover:opacity-100 transition-opacity ${
                isResizeMode ? "cursor-move" : ""
              }`}
              style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
              }}
              onMouseDown={handleMouseDown}
            >
              {executive.avatarUrl && (
                <Image
                  src={executive.avatarUrl}
                  alt={executive.name}
                  width={160}
                  height={160}
                  className="object-contain"
                  style={{ transform: `scale(${scale})` }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              )}

              {!executive.avatarUrl && executive.studentId && (
                <Image
                  src={`/executives/${executive.studentId}.png`}
                  alt={executive.name}
                  width={160}
                  height={160}
                  className="object-contain"
                  style={{ transform: `scale(${scale})` }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              )}
            </div>
            <div className="relative z-10 max-w-[calc(100%-80px)] pr-4">
              <CardTitle className="text-lg flex items-center gap-2">
                {getRoleIcon(executive.position)}
                <span className="line-clamp-2 overflow-hidden text-ellipsis">{executive.name}</span>
              </CardTitle>
              <CardDescription className="line-clamp-1 overflow-hidden text-ellipsis">
                {getRoleName(executive.position)}
              </CardDescription>
            </div>
          </CardHeader>
        </div>
      </Card>
      {isResizeMode && (
        <div className="p-4 bg-muted/20 rounded-b-lg">
          <div className="flex items-center gap-2 mb-2">
            <ZoomOut className="h-4 w-4" />
            <Slider
              value={[scale]}
              min={0.5}
              max={2}
              step={0.1}
              onValueChange={(values: number[]) => setScale(values[0])}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4" />
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            Position: X:{position.x.toFixed(0)}, Y:{position.y.toFixed(0)} |
            Scale: {scale.toFixed(1)}
          </div>
          <div className="flex justify-center">
            <Button onClick={saveAvatarSettings} className="w-full">
              <Save className="h-4 w-4 mr-2" /> Save Avatar Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getRoleIcon(position: string) {
  const positionLower = position.toLowerCase();
  if (positionLower.includes("moderator"))
    return <GraduationCap className="h-5 w-5 text-primary" />;
  if (positionLower.includes("president"))
    return <Crown className="h-5 w-5 text-primary" />;
  if (positionLower.includes("treasurer"))
    return <HandCoins  className="h-5 w-5 text-primary" />;
  if (positionLower.includes("programming"))
    return <Code2 className="h-5 w-5 text-primary" />;
  if (
    positionLower.includes("organizational") ||
    positionLower.includes("coordinator")
  )
    return <Users className="h-5 w-5 text-primary" />;
  if (positionLower.includes("cultural") || positionLower.includes("media") || positionLower.includes("photo"))
    return <Camera className="h-5 w-5 text-primary" />;
  if (positionLower.includes("academic"))
    return <BookOpen className="h-5 w-5 text-primary" />;
  if (positionLower.includes("admin"))
    return <Building2 className="h-5 w-5 text-primary" />;

  return <UserCog className="h-5 w-5 text-primary" />;
}

function getRoleName(position: string) {
  return position.replace("Development", "Dev");
}
