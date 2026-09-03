"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FormField } from "@/components/ui/form-elements";
import { useAutomationSettings } from "@/hooks/useAutomationSettings";
import { formatWeiToEth } from "@/lib/utils";
import { parseEther } from "viem";

export function KillSwitchBanner() {
  const { settings, update, isUpdating, isLoading } = useAutomationSettings();
  const [showCaps, setShowCaps] = useState(false);
  const [maxSpendEth, setMaxSpendEth] = useState("");

  if (isLoading || !settings) {
    return <Card className="h-16 animate-pulse" />;
  }

  const isOn = settings.automationEnabled;

  return (
    <Card className={isOn ? "border-warning/40" : "border-border"}>
      <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          {isOn ? (
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              Automation is {isOn ? "ON" : "OFF"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isOn
                ? "Rules can monitor and surface matches for your confirm. Nothing fires without your click."
                : "All sniper and copy monitoring is paused. Turn on to let armed rules start watching."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowCaps((s) => !s)}>
            Caps
          </Button>
          <Button
            variant={isOn ? "destructive" : "default"}
            size="sm"
            isLoading={isUpdating}
            onClick={() => update({ automationEnabled: !isOn, maxConcurrentRuns: settings.maxConcurrentRuns })}
          >
            {isOn ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </CardContent>
      {showCaps && (
        <CardContent className="border-t border-border pt-3 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Max spend per day (ETH)" hint={settings.maxSpendPerDayWei ? `Current: ${formatWeiToEth(settings.maxSpendPerDayWei)} ETH` : "No cap set"}>
              <div className="flex gap-2">
                <Input placeholder="e.g. 0.5" value={maxSpendEth} onChange={(e) => setMaxSpendEth(e.target.value)} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      update({
                        automationEnabled: isOn,
                        maxSpendPerDayWei: maxSpendEth ? parseEther(maxSpendEth).toString() : null,
                        maxConcurrentRuns: settings.maxConcurrentRuns,
                      });
                    } catch {
                      // ignore malformed input, button just no-ops
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </FormField>
            <FormField label="Max concurrent runs" hint="How many runs can be RUNNING at once across all campaigns.">
              <Input
                type="number"
                min={1}
                max={20}
                value={settings.maxConcurrentRuns}
                onChange={(e) =>
                  update({
                    automationEnabled: isOn,
                    maxSpendPerDayWei: settings.maxSpendPerDayWei,
                    maxConcurrentRuns: Number(e.target.value) || 1,
                  })
                }
              />
            </FormField>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
