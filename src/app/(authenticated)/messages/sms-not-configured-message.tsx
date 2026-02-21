import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SmsNotConfiguredMessage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
        <MessageSquare className="h-6 w-6 text-blue-600" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">SMS Not Configured</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Set up an SMS provider to send and receive messages with your customers. Supports Twilio, Vonage, and Telnyx.
      </p>
      <Button asChild className="mt-4" size="sm">
        <Link href="/settings/sms">
          Go to SMS Settings
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
