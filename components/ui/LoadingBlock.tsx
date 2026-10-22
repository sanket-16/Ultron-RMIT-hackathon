type Props = {
  label?: string;
};

export function LoadingBlock({ label = "Loading…" }: Props) {
  return (
    <div className="flex min-h-40 flex-col justify-center" role="status" aria-live="polite">
      <p className="text-lg text-muted">{label}</p>
    </div>
  );
}
