import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function HomePage() {
  return (
    <main className="invite-gradient flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-up max-w-xl">
        <BrandLogo variant="full" priority className="mx-auto h-12" />
        <h1 className="mt-8 font-serif text-4xl font-bold text-royal sm:text-5xl">
          From invite to arrival.
        </h1>
        <p className="mt-5 text-muted-foreground">
          GatherArc brings invitations, RSVPs, guest communications, and
          event-day operations together in one place — for birthdays, weddings,
          memorials, dinners, and every gathering in between. Guests receive a
          personal invite link; there is no public listing here.
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
