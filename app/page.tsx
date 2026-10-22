import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col">
        {/* First viewport: one composition */}
        <section
          aria-label="Guardian Circle"
          className="relative isolate min-h-[100svh] overflow-hidden"
        >
          <div className="absolute inset-0 -z-20 overflow-hidden">
            <Image
              src="/hero-home.jpg"
              alt="Quiet living room light — a home where careful decisions are made"
              fill
              priority
              sizes="100vw"
              className="hero-drift object-cover object-[70%_50%]"
            />
          </div>

          {/* Always-on wash so brand + copy never sit on raw photo */}
          <div className="hero-veil absolute inset-0 -z-10 hidden sm:block" aria-hidden />
          <div className="hero-veil-mobile absolute inset-0 -z-10 sm:hidden" aria-hidden />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full max-w-2xl bg-background/40 sm:max-w-[52%]"
            aria-hidden
          />
          <div
            className="hero-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-multiply"
            aria-hidden
          />

          <div className="mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-end px-6 pb-16 pt-24 sm:justify-center sm:px-10 sm:pb-24 sm:pt-20">
            <div className="max-w-lg">
              <p className="hero-rise font-display text-[clamp(2.75rem,8vw,5rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-foreground">
                Guardian Circle
              </p>
              <h1 className="hero-rise hero-rise-delay-1 mt-6 max-w-md text-[clamp(1.35rem,3.2vw,1.75rem)] font-semibold leading-snug tracking-[-0.02em] text-foreground">
                Big decisions wait for the people you trust.
              </h1>
              <p className="hero-rise hero-rise-delay-2 mt-4 max-w-md text-base leading-relaxed text-foreground/80 sm:text-lg">
                Before money moves or life changes stick, Margaret’s circle must
                agree.
              </p>
              <div className="hero-rise hero-rise-delay-3 mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  href="/signin"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-[0.95rem] font-semibold tracking-wide text-surface transition-[transform,background-color] duration-200 hover:bg-[#264c3d] active:translate-y-px"
                >
                  Enter the circle
                </Link>
                <a
                  href="#how"
                  className="text-[0.95rem] font-medium text-foreground underline decoration-line underline-offset-[0.35em] transition-colors hover:text-accent"
                >
                  How it works
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* How it works — one job */}
        <section
          id="how"
          className="border-t border-line bg-surface px-6 py-20 sm:px-10 sm:py-28"
        >
          <div className="section-in mx-auto max-w-3xl">
            <h2 className="font-display text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
              How it works
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Three quiet steps. No dashboards in the way of the decision.
            </p>
            <ol className="mt-12 space-y-10">
              <li className="grid gap-2 sm:grid-cols-[3.5rem_1fr] sm:gap-6">
                <span className="font-display text-2xl text-accent/70">01</span>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Choose your circle
                  </p>
                  <p className="mt-1 text-muted leading-relaxed">
                    Pick the few people who know Margaret best — family, friends,
                    the ones she already trusts.
                  </p>
                </div>
              </li>
              <li className="grid gap-2 sm:grid-cols-[3.5rem_1fr] sm:gap-6">
                <span className="font-display text-2xl text-accent/70">02</span>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Set what needs agreement
                  </p>
                  <p className="mt-1 text-muted leading-relaxed">
                    Dollar limits, selling the home, changing a will — decide
                    which moves require a threshold vote.
                  </p>
                </div>
              </li>
              <li className="grid gap-2 sm:grid-cols-[3.5rem_1fr] sm:gap-6">
                <span className="font-display text-2xl text-accent/70">03</span>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Only then does it go through
                  </p>
                  <p className="mt-1 text-muted leading-relaxed">
                    Requests stay held until enough of the circle approve.
                    Without that agreement, nothing moves.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Who it's for — Margaret */}
        <section className="border-t border-line bg-background px-6 py-20 sm:px-10 sm:py-28">
          <div className="section-in mx-auto max-w-3xl">
            <h2 className="font-display text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
              Who it’s for
            </h2>
            <p className="mt-8 max-w-2xl font-display text-xl leading-relaxed text-foreground/90 sm:text-2xl">
              Margaret wants help with the big stuff — without handing over the
              keys to one person.
            </p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Her daughter, son, and a close friend form the circle. An $80k
              “investment” gets declined. A care-home invoice that everyone
              stands behind can complete. The people she trusts stay in the
              loop.
            </p>
          </div>
        </section>

        {/* Quiet closing CTA */}
        <section className="border-t border-line bg-accent-soft/40 px-6 py-20 sm:px-10 sm:py-24">
          <div className="section-in mx-auto flex max-w-3xl flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-display text-3xl tracking-[-0.02em] text-foreground sm:text-4xl">
                Ready when she is.
              </p>
              <p className="mt-3 max-w-md text-muted leading-relaxed">
                Step into Guardian Circle and keep the next big decision in
                trusted hands.
              </p>
            </div>
            <Link
              href="/signin"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-accent px-6 text-[0.95rem] font-semibold tracking-wide text-surface transition-[transform,background-color] duration-200 hover:bg-[#264c3d] active:translate-y-px"
            >
              Enter the circle
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-8 text-sm text-muted sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <span className="font-display text-base text-foreground/80">
            Guardian Circle
          </span>
          <span>Built for careful decisions.</span>
        </div>
      </footer>
    </div>
  );
}
