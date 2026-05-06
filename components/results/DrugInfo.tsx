"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  FlaskConical,
  Target,
  Cog,
  AlertTriangle,
  Thermometer,
  ChevronDown,
  Pill,
  Info,
} from "lucide-react";

interface DrugInfoProps {
  manufacturer?: string | null;
  saltComposition?: string | null;
  ingredients?: string | null;
  category?: string | null;
  description?: string | null;
  uses?: string | null;
  howItWorks?: string | null;
  sideEffects?: string | null;
  warnings?: string | null;
  storage?: string | null;
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-purple-300">{icon}</span>
        <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-text-secondary">
          {title}
        </h4>
      </div>
      <div className="text-sm text-text-primary leading-relaxed pl-7">
        {children}
      </div>
    </div>
  );
}

function parseIngredientsList(ingredientsJson: string | null | undefined): string[] {
  if (!ingredientsJson) return [];
  try {
    const parsed = JSON.parse(ingredientsJson);
    if (Array.isArray(parsed)) {
      return parsed.map((item: { name?: string; strength?: string; unit?: string }) => {
        if (typeof item === "string") return item;
        let label = item.name ?? "";
        if (item.strength) label += ` ${item.strength}${item.unit ?? ""}`;
        return label;
      }).filter(Boolean);
    }
  } catch {}
  return [];
}

export function DrugInfo({
  manufacturer,
  saltComposition,
  ingredients,
  category,
  description,
  uses,
  howItWorks,
  sideEffects,
  warnings,
  storage,
}: DrugInfoProps) {
  const [expanded, setExpanded] = useState(false);

  const ingredientsList = parseIngredientsList(ingredients);

  // Check if we have any info to display
  const hasBasicInfo = manufacturer || saltComposition || ingredientsList.length > 0 || category || description;
  const hasUsesInfo = uses || howItWorks;
  const hasDetailInfo = sideEffects || warnings || storage;

  if (!hasBasicInfo && !hasUsesInfo && !hasDetailInfo) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 mt-5"
    >
      <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
        <Info size={18} className="text-purple-300" />
        About this medicine
      </h3>

      <div className="divide-y divide-white/5">
        {/* Manufacturer */}
        {manufacturer && (
          <Section icon={<Building2 size={16} />} title="Manufacturer">
            <p>{manufacturer}</p>
          </Section>
        )}

        {/* Salt Composition / Ingredients */}
        {(saltComposition || ingredientsList.length > 0) && (
          <Section icon={<FlaskConical size={16} />} title="Composition">
            {saltComposition && (
              <p className="mb-2">{saltComposition}</p>
            )}
            {ingredientsList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ingredientsList.map((ing, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Category */}
        {category && (
          <Section icon={<Pill size={16} />} title="Category">
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
              {category}
            </span>
          </Section>
        )}

        {/* Description */}
        {description && (
          <Section icon={<Info size={16} />} title="Description">
            <p>{description}</p>
          </Section>
        )}

        {/* Uses */}
        {uses && (
          <Section icon={<Target size={16} />} title="Uses">
            <p>{uses}</p>
          </Section>
        )}

        {/* How it Works */}
        {howItWorks && (
          <Section icon={<Cog size={16} />} title="How it works">
            <p>{howItWorks}</p>
          </Section>
        )}

        {/* Collapsible detail sections */}
        {hasDetailInfo && (
          <>
            {!expanded && (
              <div className="pt-3">
                <button
                  onClick={() => setExpanded(true)}
                  className="flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200 transition-colors"
                >
                  <ChevronDown size={14} />
                  Show side effects, warnings & storage
                </button>
              </div>
            )}

            {expanded && (
              <>
                {sideEffects && (
                  <Section
                    icon={<AlertTriangle size={16} />}
                    title="Side effects"
                  >
                    <p>{sideEffects}</p>
                  </Section>
                )}

                {warnings && (
                  <Section icon={<AlertTriangle size={16} />} title="Warnings">
                    <p className="text-amber-200/80">{warnings}</p>
                  </Section>
                )}

                {storage && (
                  <Section
                    icon={<Thermometer size={16} />}
                    title="Storage"
                  >
                    <p>{storage}</p>
                  </Section>
                )}

                <div className="pt-3">
                  <button
                    onClick={() => setExpanded(false)}
                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-white transition-colors"
                  >
                    <ChevronDown size={14} className="rotate-180" />
                    Show less
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
