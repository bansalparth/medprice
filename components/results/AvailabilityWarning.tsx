import { AlertTriangle } from "lucide-react";

/**
 * Shared amber banner reminding users that Jan Aushadhi stock varies by
 * Kendra and that they should call ahead before visiting.
 *
 * Rendered in three places: the results page (`JanAushadhiCard` section),
 * the standalone `/jan-aushadhi` search page, and the `StoreLocatorPanel`
 * drawer.
 */
export function AvailabilityWarning({
  className = "",
  compact = false,
}: {
  className?: string;
  /** When true, render a tighter inline variant for narrow side panels. */
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 ${
        compact ? "px-3 py-2 text-[11px]" : "px-4 py-3 text-xs"
      } ${className}`}
    >
      <AlertTriangle
        size={compact ? 12 : 14}
        className="mt-0.5 shrink-0 text-amber-300"
      />
      <div className="leading-relaxed">
        <span className="font-semibold text-amber-100">
          Stock varies by store.
        </span>{" "}
        Jan Aushadhi Kendras don&apos;t always carry every generic. Call ahead
        using the listed number to confirm availability before visiting.
      </div>
    </div>
  );
}
