import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import BooksPage from "@/pages/books";
import BookDetailPage from "@/pages/book-detail";
import JobsPage from "@/pages/jobs";
import SchedulePage from "@/pages/schedule";
import AiProviderPage from "@/pages/ai-provider";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/books" component={BooksPage} />
        <Route path="/books/:id" component={BookDetailPage} />
        <Route path="/jobs" component={JobsPage} />
        <Route path="/schedule" component={SchedulePage} />
        <Route path="/ai-provider" component={AiProviderPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
