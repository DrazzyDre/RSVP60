import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="invite-gradient flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-up max-w-lg">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-gold-dark">
          RSVP60
        </p>
        <h1 className="font-serif text-4xl font-bold text-royal sm:text-5xl">
          An Elegant Invitation & RSVP Experience
        </h1>
        <p className="mt-5 text-muted-foreground">
          RSVP60 is a private platform for a very special 60th birthday
          celebration. Guests receive a personal invite link — there is no public
          listing here.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/admin">
            <Button variant="default" size="lg">
              Admin Dashboard
            </Button>
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Have an invite link? Open it on your phone to view your invitation and
          RSVP.
        </p>
      </div>
    </main>
  );
}
