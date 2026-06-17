import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { LayoutDashboard, BookOpen, ActivitySquare, CalendarClock, Bot } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { refetchInterval: 30000 } } as any);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/20">
        <Sidebar className="border-r">
          <SidebarHeader className="h-14 border-b px-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono font-bold text-sm">
              <div className="h-6 w-6 bg-primary text-primary-foreground flex items-center justify-center rounded-sm">
                K
              </div>
              KDP_UPLOAD_CTRL
            </div>
          </SidebarHeader>
          <SidebarContent>
            <div className="px-2 py-4">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/"}>
                    <Link href="/">
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/books")}>
                    <Link href="/books">
                      <BookOpen className="h-4 w-4" />
                      <span>Books Catalog</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/jobs")}>
                    <Link href="/jobs">
                      <ActivitySquare className="h-4 w-4" />
                      <span>Job Monitor</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/schedule"}>
                    <Link href="/schedule">
                      <CalendarClock className="h-4 w-4" />
                      <span>Schedule Config</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/ai-provider"}>
                    <Link href="/ai-provider">
                      <Bot className="h-4 w-4" />
                      <span>AI Provider</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
            <div className="mt-auto p-4 flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <div className={`h-2 w-2 rounded-full ${health ? 'bg-green-500' : 'bg-red-500'}`} />
              API: {health ? 'ONLINE' : 'OFFLINE'}
            </div>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <main className="flex-1 flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
