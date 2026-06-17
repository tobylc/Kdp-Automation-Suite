import { useGetSchedule, useUpdateSchedule, getGetScheduleQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, Save, Info } from "lucide-react";
import { format } from "date-fns";

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: schedule, isLoading } = useGetSchedule();
  
  const [cronExpression, setCronExpression] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (schedule) {
      setCronExpression(schedule.cronExpression);
      setEnabled(schedule.enabled);
    }
  }, [schedule]);

  const updateMutation = useUpdateSchedule({
    mutation: {
      onSuccess: () => {
        toast({ title: "Schedule Updated", description: "The cron schedule has been saved successfully." });
        queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Update Failed", description: (err as any).error ?? err.message, variant: "destructive" });
      }
    }
  });

  const handleSave = () => {
    updateMutation.mutate({ data: { cronExpression, enabled } });
  };

  if (isLoading) {
    return <div className="p-10 flex justify-center text-muted-foreground">Loading schedule config...</div>;
  }

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule Configuration</h1>
        <p className="text-muted-foreground mt-1">Configure automated polling and job execution</p>
      </div>

      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Automation
          </CardTitle>
          <CardDescription>
            Set up a cron schedule to automatically scan for new books and queue upload jobs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/30 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Automation</Label>
              <p className="text-sm text-muted-foreground">Automatically run the scanner according to the schedule.</p>
            </div>
            <Switch 
              checked={enabled} 
              onCheckedChange={setEnabled} 
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="cron" className="text-base">Cron Expression</Label>
            <Input 
              id="cron" 
              value={cronExpression} 
              onChange={(e) => setCronExpression(e.target.value)} 
              className="font-mono bg-muted/20"
              placeholder="0 * * * *"
            />
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-blue-50/50 text-blue-800 p-3 rounded-md border border-blue-100">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Standard cron format (Minute, Hour, Day of Month, Month, Day of Week).<br/>
                Example: <code className="bg-blue-100 px-1 rounded">0 * * * *</code> runs every hour on the hour.
              </div>
            </div>
          </div>

          {schedule && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Last Run</div>
                <div className="mt-1 font-mono text-sm">
                  {schedule.lastRunAt ? format(new Date(schedule.lastRunAt), "MMM d, yyyy HH:mm:ss") : "Never"}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Next Scheduled Run</div>
                <div className="mt-1 font-mono text-sm">
                  {schedule.nextRunAt ? format(new Date(schedule.nextRunAt), "MMM d, yyyy HH:mm:ss") : "Not scheduled"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t bg-muted/10 p-4">
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending || (cronExpression === schedule?.cronExpression && enabled === schedule?.enabled)}
            className="ml-auto font-mono text-sm"
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "SAVING..." : "SAVE_CONFIG"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
