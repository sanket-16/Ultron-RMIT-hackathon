type Props = {
  message: string;
  onRetry?: () => void;
};

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl bg-rose-50 px-4 py-4 text-rose-900"
      role="alert"
    >
      <p className="text-lg leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="h-14 rounded-xl border border-rose-200 bg-white px-4 text-lg font-medium text-rose-900"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}
