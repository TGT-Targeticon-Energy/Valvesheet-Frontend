import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  description?: string;
}

interface ProgressStepsProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function ProgressSteps({ steps, currentStep, className }: ProgressStepsProps) {
  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((step, index) => {
        const isComplete = index <= currentStep && currentStep >= 0;
        const isActive = index === currentStep;
        const isPending = index > currentStep || currentStep < 0;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "progress-step transition-all duration-300",
                  isComplete && !isActive && "progress-step-complete",
                  isActive && "progress-step-active animate-pulse-subtle",
                  isPending && "progress-step-pending"
                )}
              >
                {isComplete && !isActive ? (
                  <Check className="w-4 h-4" />
                ) : isActive ? (
                  <Circle className="w-3 h-3 fill-current" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    "text-xs font-medium transition-colors",
                    isComplete ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "w-16 h-0.5 mx-3 mt-[-20px] transition-colors duration-500",
                  isComplete && index < currentStep ? "bg-validated" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
