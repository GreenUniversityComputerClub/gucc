"use client";

import { usePathname, useRouter } from "next/navigation";
import { getAvailableYears } from "@/app/executives/util";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ExecutivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const currentYear = pathname.split("/").pop();
  const availableYears = getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );

  const handleYearChange = (year: string) => {
    router.push(`/executives/${year}`);
  };

  return (
    <div className="pb-16">
      <div className="bg-muted py-6">
        <div className="container">
          <h1 className="text-3xl font-bold tracking-tight">GUCC Executives</h1>
          <p className="text-muted-foreground max-w-[700px] mt-2">
            Meet the dedicated executives who have led the Green University Computer Club
          </p>
          
          <div className="flex justify-center mt-6 mb-4">
            <div className="max-w-full overflow-x-auto border rounded-lg border-2 border-gray-200 dark:border-white-100">
              <Tabs 
                value={currentYear} 
                onValueChange={handleYearChange}
                className="w-full min-w-max"
              >
                <TabsList className="w-full min-w-max">
                  {availableYears.map((year) => (
                    <TabsTrigger key={year} value={year}>
                      <span className="hidden md:inline">{year}</span>
                      <span className="md:hidden">{year.slice(-2)}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
} 