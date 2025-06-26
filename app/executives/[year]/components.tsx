"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { RESIZE_AVATAR } from "@/app/config";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  User,
  Trophy,
  ZoomIn,
  ZoomOut,
  HandCoins,
  FileText,
  ClipboardList,
  Share2,
  Palette,
  Linkedin,
  Github,
  Twitter,
  Facebook,
  Mail,
} from "lucide-react";
import type { Executive } from "@/app/executives/util";

export function ExecutiveCard({
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

  // Card Hover Effect for Social Media Icons
  const hasSocialLinks = executive.linkedin || executive.github || executive.facebook || executive.twitter || executive.mail;
  
  return (
    <div className="relative group">
      {/* Executive Card */}
      <Card className="overflow-hidden min-h-[7.5rem] h-auto relative hover:shadow-lg transition-shadow duration-300">
        <div className="relative">
          <CardHeader className="flex flex-row items-center gap-4 relative">
            {/* Avatar */}
            <div
              ref={imageRef}
              className={`absolute -right-8 -top-4 w-40 h-40 opacity-100 transition-opacity ${
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

            {/* Name & Role */}
            <div className="relative z-10 max-w-[calc(100%-80px)] pr-4">
              <CardTitle className="text-lg flex items-center gap-2">
                {getRoleIcon(executive.position)}
                <span className="line-clamp-2 overflow-hidden text-ellipsis">
                  {executive.name}
                </span>
              </CardTitle>
              <CardDescription className="line-clamp-1 overflow-hidden text-ellipsis">
                {getRoleName(executive.position)}
              </CardDescription>
            </div>
          </CardHeader>
        </div>
        
        {/* Social Media Indicator */}
        {hasSocialLinks && (
          <div className="absolute top-3 right-3 opacity-70 group-hover:opacity-0 transition-opacity duration-300">
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </Card>

      {/* Social Media Links - Enhanced for Dark Mode */}
      {hasSocialLinks && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 bg-card/95 backdrop-blur-sm border border-border/50 px-3 py-2 rounded-full flex space-x-1 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg hover:shadow-xl transform group-hover:scale-105 z-10">
          {executive.linkedin && (
            <a
              href={executive.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-accent transition-all duration-200 group/link hover:scale-110"
              title="LinkedIn Profile"
              aria-label={`${executive.name}'s LinkedIn Profile`}
            >
              <Linkedin className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-[#0077b5] transition-colors" />
            </a>
          )}
          {executive.github && (
            <a 
              href={executive.github} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-accent transition-all duration-200 group/link hover:scale-110"
              title="GitHub Profile"
              aria-label={`${executive.name}'s GitHub Profile`}
            >
              <Github className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-[#333] dark:group-hover/link:text-[#f0f6fc] transition-colors" />
            </a>
          )}
          {executive.facebook && (
            <a
              href={executive.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-accent transition-all duration-200 group/link hover:scale-110"
              title="Facebook Profile"
              aria-label={`${executive.name}'s Facebook Profile`}
            >
              <Facebook className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-[#1877f2] transition-colors" />
            </a>
          )}
          {executive.twitter && (
            <a
              href={executive.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-accent transition-all duration-200 group/link hover:scale-110"
              title="Twitter/X Profile"
              aria-label={`${executive.name}'s Twitter/X Profile`}
            >
              <Twitter className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-[#1da1f2] transition-colors" />
            </a>
          )}
          {executive.mail && (
            <a 
              href={`mailto:${executive.mail}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-accent transition-all duration-200 group/link hover:scale-110"
              title="Send Email"
              aria-label={`Send email to ${executive.name}`}
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
            </a>
          )}
        </div>
      )}

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

export function AdminPanel({ year }: { year: string }) {
  const [isResizeMode, setIsResizeMode] = useState(RESIZE_AVATAR);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
          year,
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

  return (
    <>
      {isAdmin && (
        <div className="mb-4 p-4 bg-yellow-50/80 dark:bg-yellow-950/20 border border-yellow-200/50 dark:border-yellow-800/30 rounded-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <span className="font-medium">Admin Mode</span> - You can{" "}
              {isResizeMode ? "disable" : "enable"} avatar resize mode
            </div>
            <Button
              variant={isResizeMode ? "destructive" : "outline"}
              size="sm"
              onClick={toggleResizeMode}
              className="border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
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
              className="bg-primary hover:bg-primary/90"
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
    </>
  );
}

export function CampusTabs({ year, yearData }: { year: string; yearData: any }) {
  const [activeCampus, setActiveCampus] = useState("permanent");
  const [isResizeMode] = useState(RESIZE_AVATAR);

  if (yearData?.campuses) {
    return (
      <Tabs
        defaultValue={year === "2023" ? "merged" : "city"}
        className="mt-8"
        onValueChange={setActiveCampus}
      >
        <div className="flex justify-center mb-8">
          <TabsList>
            <TabsTrigger value={year === "2023" ? "merged" : "city"}>
              {year === "2023" ? "Merged Campus" : "City Campus"}
            </TabsTrigger>
            <TabsTrigger value="permanent">
              Permanent Campus
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="permanent">
          {renderCampusContent(
            yearData.campuses.permanent,
            isResizeMode
          )}
        </TabsContent>
        <TabsContent value={year === "2023" ? "merged" : "city"}>
          {renderCampusContent(
            yearData.campuses[year === "2023" ? "merged" : "city"],
            isResizeMode
          )}
        </TabsContent>
      </Tabs>
    );
  }

  if (yearData?.wings) {
    return (
      <Tabs defaultValue={"gucc"} className="mt-8" onValueChange={setActiveCampus}>
        <div className="flex justify-center mb-8">
          <TabsList>
            <TabsTrigger value={"gucc"}>GUCC</TabsTrigger>
            <TabsTrigger value="vgs">VGS</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="gucc">
          {renderCampusContent(yearData, isResizeMode)}
        </TabsContent>
        <TabsContent value="vgs">
          {renderCampusContent(yearData.wings.vgs, isResizeMode)}
        </TabsContent>
      </Tabs>
    );
  }

  // For years without campus or wings structure, use the simple format
  return (
    <>
      {yearData.facultyMembers.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Faculty Advisors
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {yearData.facultyMembers.map((faculty: any, index: number) => (
              <ExecutiveCard
                key={index}
                executive={faculty}
                isResizeMode={isResizeMode}
              />
            ))}
          </div>
        </section>
      )}

      {yearData.studentExecutives.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Student Executives
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {yearData.studentExecutives.map((executive: any, index: number) => (
              <ExecutiveCard
                key={index}
                executive={executive}
                isResizeMode={isResizeMode}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function renderCampusContent(campus: any, isResizeMode: boolean) {
  return (
    <>
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          Faculty Advisors
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campus.facultyMembers.map((faculty: any, index: number) => (
            <ExecutiveCard
              key={index}
              executive={faculty}
              isResizeMode={isResizeMode}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Student Executives
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campus.studentExecutives.map((executive: any, index: number) => (
            <ExecutiveCard
              key={index}
              executive={executive}
              isResizeMode={isResizeMode}
            />
          ))}
        </div>
      </section>
    </>
  );
}

export function getRoleIcon(position: string) {
  const positionLower = position.toLowerCase();
  if (positionLower.includes("moderator"))
    return <GraduationCap className="h-5 w-5 text-primary" />;
  if (positionLower.includes("president"))
    return <Crown className="h-5 w-5 text-primary" />;
  if (positionLower.includes("general"))
    return <UserCog className="h-5 w-5 text-primary" />;
  if (positionLower.includes("treasurer"))
    return <HandCoins className="h-5 w-5 text-primary" />;
  if (positionLower.includes("programming"))
    return <Code2 className="h-5 w-5 text-primary" />;
  if (positionLower.includes("information"))
    return <FileText className="h-5 w-5 text-primary" />;
  if (positionLower.includes("organizing") || positionLower.includes("event"))
    return <ClipboardList className="h-5 w-5 text-primary" />;
  if (positionLower.includes("cultural"))
    return <Palette className="h-5 w-5 text-primary" />;
  if (positionLower.includes("publication"))
    return <BookOpen className="h-5 w-5 text-primary" />;
  if (positionLower.includes("outreach"))
    return <Share2 className="h-5 w-5 text-primary" />;
  if (positionLower.includes("sports"))
    return <Trophy className="h-5 w-5 text-primary" />;
  if (positionLower.includes("member"))
    return <User className="h-5 w-5 text-primary" />;
  if (
    positionLower.includes("cultural") ||
    positionLower.includes("media") ||
    positionLower.includes("photo")
  )
    return <Camera className="h-5 w-5 text-primary" />;
  if (positionLower.includes("academic"))
    return <BookOpen className="h-5 w-5 text-primary" />;
  if (positionLower.includes("admin"))
    return <Building2 className="h-5 w-5 text-primary" />;

  return <UserCog className="h-5 w-5 text-primary" />;
}

export function getRoleName(position: string) {
  return position.replace("Development", "Dev");
} 