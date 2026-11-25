import { useState } from 'react';
import {
  Activity,
  Baby,
  BookOpen,
  Check,
  CheckCircle2,
  Compass,
  Droplets,
  Flame,
  Heart,
  HeartHandshake,
  HelpCircle,
  Moon,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Thermometer,
  Users,
  Utensils,
} from 'lucide-react';
import { PHASE_INFO } from '../engine/catalog';
import {
  CYCLE_MYTHS,
  getArticlesForPhase,
  getCheckinActionsForPhase,
  getDateIdeasForPhase,
  type ArticleIllustrationId,
  type CycleArticle,
} from '../engine/partnerLibrary';
import { formatShortDate } from '../engine/temporal';
import type { CyclePhase, PartnerSnapshot } from '../types';
import { ModalDialog } from './ModalDialog';

function ArticleArt({ id }: { id: ArticleIllustrationId }) {
  const iconProps = { size: 38, strokeWidth: 1.75 };
  switch (id) {
    case 'period':
      return <Droplets {...iconProps} color="var(--color-brand-primary)" />;
    case 'cramps':
      return <Flame {...iconProps} color="var(--color-brand-primary)" />;
    case 'energy':
      return <Sparkles {...iconProps} color="var(--color-brand-secondary)" />;
    case 'ovulation':
      return <Compass {...iconProps} color="var(--color-brand-accent)" />;
    case 'libido':
      return <Heart {...iconProps} color="var(--color-brand-primary)" />;
    case 'luteal':
      return <Moon {...iconProps} color="var(--color-brand-accent)" />;
    case 'stress':
      return <Activity {...iconProps} color="var(--color-text-primary)" />;
    case 'support':
      return <HeartHandshake {...iconProps} color="var(--color-brand-secondary)" />;
    case 'bbt':
      return <Thermometer {...iconProps} color="var(--color-brand-secondary)" />;
    case 'nutrition':
      return <Utensils {...iconProps} color="var(--color-brand-accent)" />;
    case 'pregnancy':
      return <Baby {...iconProps} color="var(--color-brand-primary)" />;
    case 'doctor':
      return <Stethoscope {...iconProps} color="var(--color-text-primary)" />;
  }
}

interface ArticleShelfProps {
  heading: string;
  phase: CyclePhase;
  excludeLibido?: boolean;
}

export function ArticleShelf({ heading, phase, excludeLibido = false }: ArticleShelfProps) {
  const [activeArticle, setActiveArticle] = useState<CycleArticle | null>(null);
  const articles = getArticlesForPhase(phase).filter(
    (a) => !excludeLibido || a.id !== 'libido-and-cycle',
  );

  return (
    <section aria-label={heading}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          {heading}
        </h3>
        <span className="section-caption">{articles.length} guides</span>
      </div>

      <div className="h-scroll">
        {articles.map((article) => (
          <button
            key={article.id}
            type="button"
            className="article-card"
            onClick={() => setActiveArticle(article)}
          >
            <div className="article-card-art" style={{ background: article.accentBg }}>
              <ArticleArt id={article.illustration} />
              <span className="article-cat-pill">{article.category}</span>
            </div>
            <div className="article-card-title">{article.title}</div>
            <div className="article-card-meta">{article.readMinutes} min read</div>
          </button>
        ))}
      </div>

      <ModalDialog
        open={activeArticle !== null}
        title={activeArticle?.title ?? ''}
        subtitle={
          activeArticle
            ? `${activeArticle.category} · ${activeArticle.readMinutes} min read`
            : undefined
        }
        onClose={() => setActiveArticle(null)}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setActiveArticle(null)}
            autoFocus
          >
            Done Reading
          </button>
        }
      >
        {activeArticle ? (
          <>
            <div className="card-subtle" style={{ borderLeft: '3px solid var(--color-brand-primary)' }}>
              <div className="metric-label" style={{ marginBottom: 6 }}>
                Key Takeaways
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.86rem' }}>
                {activeArticle.keyTakeaways.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            {activeArticle.sections.map((sec) => (
              <div key={sec.heading}>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.96rem', color: 'var(--color-text-primary)' }}>
                  {sec.heading}
                </h4>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                  {sec.body}
                </p>
              </div>
            ))}

            <div className="card-subtle" style={{ borderLeft: '3px solid var(--color-brand-accent)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: 4 }}>
                Thoughtful Partner Tip
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {activeArticle.partnerTip}
              </p>
            </div>
          </>
        ) : null}
      </ModalDialog>
    </section>
  );
}

interface PartnerDiscoverSectionProps {
  watchedSnapshot: PartnerSnapshot | null;
  fallbackPhase: CyclePhase;
  today: string;
  simpleMode?: boolean;
}

export function PartnerDiscoverSection({
  watchedSnapshot,
  fallbackPhase,
  today,
  simpleMode = false,
}: PartnerDiscoverSectionProps) {
  const phase = watchedSnapshot?.phase ?? fallbackPhase;
  const partnerName = watchedSnapshot?.profileLabel ?? 'Her';
  const phaseInfo = PHASE_INFO[phase];

  const [herDayOpen, setHerDayOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedIdeaIdx, setSelectedIdeaIdx] = useState<number>(0);
  const [mythOpen, setMythOpen] = useState(false);
  const [mythIdx, setMythIdx] = useState(0);
  const [decoderOpen, setDecoderOpen] = useState(false);

  const dateIdeas = getDateIdeasForPhase(phase);
  const checkinActions = getCheckinActionsForPhase(phase);
  const currentIdea = dateIdeas[selectedIdeaIdx % dateIdeas.length];
  const currentMyth = CYCLE_MYTHS[mythIdx % CYCLE_MYTHS.length];

  const handleSpinWheel = () => {
    if (spinning) return;
    setSpinning(true);
    const nextIdx = (selectedIdeaIdx + 1 + Math.floor(Math.random() * Math.max(1, dateIdeas.length - 1))) % dateIdeas.length;
    setWheelAngle((prev) => prev + 720 + Math.floor(Math.random() * 240));
    window.setTimeout(() => {
      setSelectedIdeaIdx(nextIdx);
      setSpinning(false);
    }, 650);
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <>
      {/* 1. DISCOVER TOP INSIGHTS ABOUT HER (Horizontal Story Cards) */}
      <section aria-label="Discover top insights about her">
        <h3 className="section-title" style={{ marginBottom: 10 }}>
          Discover top insights about {watchedSnapshot ? partnerName : 'her'}
        </h3>
        <div className="h-scroll">
          {/* Card 1: Her day today */}
          <button
            type="button"
            className="story-card story-card--maroon"
            onClick={() => setHerDayOpen(true)}
          >
            <span className="story-pill">Her</span>
            <div className="story-title">Her day today</div>
            <div className="story-foot">{formatShortDate(watchedSnapshot?.asOfDate ?? today)}</div>
          </button>

          {/* Card 2: Your daily check-in */}
          <button
            type="button"
            className="story-card story-card--sand"
            onClick={() => setCheckinOpen(true)}
          >
            <span className="story-pill">You</span>
            <div className="story-title">Your daily check-in</div>
            <div className="story-foot tabular">
              {checkinActions.filter((a) => checkedIds.includes(a.id)).length}/{checkinActions.length} done
            </div>
          </button>

          {/* Card 3: Spin the wheel for a date idea */}
          <button
            type="button"
            className="story-card story-card--forest"
            onClick={() => setWheelOpen(true)}
          >
            <span className="story-pill">Both</span>
            <div className="story-title">Spin the wheel for a date idea</div>
            <div className="story-foot">Phase-matched</div>
          </button>

          {/* Card 4: Myth vs Fact */}
          <button
            type="button"
            className="story-card story-card--gold"
            onClick={() => setMythOpen(true)}
          >
            <span className="story-pill">Facts</span>
            <div className="story-title">Cycle myths, busted</div>
            <div className="story-foot">{CYCLE_MYTHS.length} quick truths</div>
          </button>
        </div>
      </section>

      {/* 2. RECOMMENDED HERO BANNER: HER CYCLE, DECODED */}
      <section aria-label="Recommended partner guide">
        <h3 className="section-title" style={{ marginBottom: 10 }}>
          Recommended
        </h3>
        <div className="decoder-banner">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
            <h4 className="decoder-title">Her body, decoded</h4>
            <ul className="decoder-list">
              <li>
                <RefreshCw size={16} />
                <span>Understand her cycle</span>
              </li>
              <li>
                <CheckCircle2 size={16} />
                <span>Recognize her symptoms</span>
              </li>
              <li>
                <Users size={16} />
                <span>Know when to offer support</span>
              </li>
            </ul>
            <div>
              <button
                type="button"
                className="decoder-cta"
                onClick={() => setDecoderOpen(true)}
              >
                <BookOpen size={16} />
                Get insights
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. BASED ON YOUR PARTNER'S CURRENT CYCLE (Horizontal Article Carousel) */}
      <ArticleShelf
        heading="Based on your partner's current cycle"
        phase={phase}
        excludeLibido={simpleMode}
      />

      {/* MODAL: Her Day Today */}
      <ModalDialog
        open={herDayOpen}
        title={`${watchedSnapshot ? partnerName : 'Her'}'s Day Today`}
        subtitle={`${formatShortDate(watchedSnapshot?.asOfDate ?? today)} · ${phaseInfo.title}`}
        onClose={() => setHerDayOpen(false)}
        footer={
          <button type="button" className="btn-primary" onClick={() => setHerDayOpen(false)} autoFocus>
            Got it
          </button>
        }
      >
        <div className="card-subtle">
          <div className="metric-label">What&apos;s Happening Biologically</div>
          <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            {phaseInfo.summary}
          </p>
        </div>
        <div className="card-subtle" style={{ borderLeft: '3px solid var(--color-brand-accent)' }}>
          <div className="metric-label">Best Way to Show Up Today</div>
          <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
            {phaseInfo.gentleCare}
          </p>
        </div>
      </ModalDialog>

      {/* MODAL: Your Daily Check-In */}
      <ModalDialog
        open={checkinOpen}
        title="Your Daily Partner Check-In"
        subtitle={`Tailored to her ${phaseInfo.shortLabel} phase`}
        onClose={() => setCheckinOpen(false)}
        footer={
          <button type="button" className="btn-primary" onClick={() => setCheckinOpen(false)} autoFocus>
            Done
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {checkinActions.map((act) => {
            const done = checkedIds.includes(act.id);
            return (
              <button
                key={act.id}
                type="button"
                className="chip"
                aria-pressed={done}
                onClick={() => toggleCheck(act.id)}
                style={{
                  borderRadius: 10,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  padding: '12px 14px',
                  width: '100%',
                }}
              >
                <Check size={16} style={{ flexShrink: 0, opacity: done ? 1 : 0.35 }} />
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      </ModalDialog>

      {/* MODAL: Spin the Wheel for a Date Idea */}
      <ModalDialog
        open={wheelOpen}
        title="Date Idea Wheel"
        subtitle={`Curated for her ${phaseInfo.shortLabel} phase`}
        onClose={() => setWheelOpen(false)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setWheelOpen(false)}>
            Close
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 148, height: 148, display: 'grid', placeItems: 'center' }}>
            <svg
              viewBox="0 0 148 148"
              style={{
                width: '100%',
                height: '100%',
                transform: `rotate(${wheelAngle}deg)`,
                transition: 'transform 650ms cubic-bezier(0.23, 1, 0.32, 1)',
              }}
              aria-hidden="true"
            >
              <circle cx="74" cy="74" r="66" fill="var(--color-brand-primary)" />
              <path d="M74 8 A66 66 0 0 1 140 74 L74 74 Z" fill="var(--color-brand-secondary)" />
              <path d="M74 140 A66 66 0 0 1 8 74 L74 74 Z" fill="var(--color-brand-accent)" />
              <circle cx="74" cy="74" r="18" fill="var(--color-surface-card)" />
            </svg>
            <Heart size={18} color="var(--color-brand-primary)" style={{ position: 'absolute' }} />
          </div>

          <div className="card-subtle" style={{ width: '100%', textAlign: 'center' }}>
            <span className="phase-badge phase-badge--ovulation" style={{ marginBottom: 8 }}>
              {currentIdea.vibe} Date
            </span>
            <h4 style={{ margin: '6px 0 4px', fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>
              {currentIdea.title}
            </h4>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--color-text-secondary)' }}>
              {currentIdea.description}
            </p>
          </div>

          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%' }}
            disabled={spinning}
            onClick={handleSpinWheel}
          >
            <Sparkles size={16} />
            {spinning ? 'Spinning…' : 'Spin for Another Date Idea'}
          </button>
        </div>
      </ModalDialog>

      {/* MODAL: Cycle Myths vs Facts */}
      <ModalDialog
        open={mythOpen}
        title="Cycle Myths, Busted"
        subtitle={`${mythIdx + 1} of ${CYCLE_MYTHS.length} · ${currentMyth.phaseHint}`}
        onClose={() => setMythOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMythOpen(false)}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setMythIdx((i) => (i + 1) % CYCLE_MYTHS.length)}
            >
              Next Fact
            </button>
          </>
        }
      >
        <div className="card-subtle" style={{ borderLeft: '3px solid var(--color-brand-primary)' }}>
          <div className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <HelpCircle size={13} /> Common Myth
          </div>
          <p style={{ margin: '6px 0 0', fontWeight: 600, fontSize: '0.95rem' }}>
            &ldquo;{currentMyth.myth}&rdquo;
          </p>
        </div>
        <div className="card-subtle" style={{ borderLeft: '3px solid var(--color-brand-secondary)' }}>
          <div className="metric-label">The Reality</div>
          <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            {currentMyth.fact}
          </p>
        </div>
      </ModalDialog>

      {/* MODAL: 4-Phase Cycle Decoder */}
      <ModalDialog
        open={decoderOpen}
        title="Her Body, Decoded"
        subtitle="The 4 phases of a menstrual cycle at a glance"
        onClose={() => setDecoderOpen(false)}
        footer={
          <button type="button" className="btn-primary" onClick={() => setDecoderOpen(false)} autoFocus>
            Close Guide
          </button>
        }
      >
        {(
          [
            {
              phase: '1. Menstrual Phase (Days ~1–5)',
              hormones: 'Estrogen & progesterone at lowest baseline.',
              support: 'Prioritize warmth, rest, iron-rich meals, and take chores off her plate.',
            },
            {
              phase: '2. Follicular Phase (Days ~6–12)',
              hormones: 'Estrogen climbs steadily; focus and energy rise.',
              support: 'Great window for fun dates, walks, creative plans, and social outings.',
            },
            {
              phase: '3. Fertile & Ovulation Window (~Days 11–16)',
              hormones: 'Estrogen & LH peak to release an egg; confidence & desire often peak.',
              support: 'Quality time together; keep TTC calm and affectionate if trying to conceive.',
            },
            {
              phase: '4. Luteal Phase (Final ~12–14 Days)',
              hormones: 'Progesterone rises then drops; PMS cues can appear in the final 3–5 days.',
              support: 'Extra patience, steady comfort meals, cozy nights in, and zero dismissive remarks.',
            },
          ] as const
        ).map((item) => (
          <div key={item.phase} className="card-subtle">
            <strong style={{ fontSize: '0.92rem', color: 'var(--color-brand-primary)' }}>
              {item.phase}
            </strong>
            <p style={{ margin: '4px 0', fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
              {item.hormones}
            </p>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-text-primary)' }}>
              <strong>How to help:</strong> {item.support}
            </p>
          </div>
        ))}
      </ModalDialog>
    </>
  );
}
