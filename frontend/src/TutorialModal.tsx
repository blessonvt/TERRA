import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const tutorialSteps = [
  {
    title: 'Welcome to TERRA',
    body: 'TERRA compares measured terrain characteristics at selected locations on Earth, the Moon, and Mars. Its similarity index is a comparison aid, not a probability or a claim that two environments are identical.',
    route: '/',
    action: 'Start on Overview',
  },
  {
    title: 'Choose a world',
    body: 'Open Free Roam and switch between Earth, Moon, and Mars. Each map uses its own public imagery source and available elevation coverage.',
    route: '/free-roam',
    action: 'Open Free Roam',
  },
  {
    title: 'Explore the map',
    body: 'Pan and zoom the map. Select a catalog location or click a coordinate to request terrain samples. A clicked point is a sample location, not a curated scientific site.',
    route: '/free-roam',
    action: 'Explore the map',
  },
  {
    title: 'Select a location',
    body: 'The location panel shows coordinates, terrain context, and source coverage. Use the same selection in the comparison workspace.',
    route: '/free-roam',
    action: 'View location details',
  },
  {
    title: 'Understand similarity',
    body: 'The index averages only the comparable measurements that are available. It is not a probability, and missing values are excluded rather than filled in.',
    route: '/compare',
    action: 'Open Compare',
  },
  {
    title: 'Explore location images',
    body: 'Open the image gallery to search NASA’s public archive. TERRA only shows records whose metadata identifies the selected location; some locations will have no matching images.',
    route: '/compare',
    action: 'See image search',
  },
  {
    title: 'Find historical sites',
    body: 'The exploration layer marks confirmed crewed and robotic landing locations separately from ordinary catalog points. Read each landmark’s mission, date, and source.',
    route: '/history',
    action: 'Open historical sites',
  },
  {
    title: 'Compare locations',
    body: 'Choose any two supported locations. The reference and target can be on different worlds or the same world when their measurement datums are compatible.',
    route: '/compare',
    action: 'Compare locations',
  },
  {
    title: 'Read parameter diagnostics',
    body: 'Review elevation, slope, roughness, and local relief separately. Pressure, albedo, thermal inertia, and grain-size scores remain unavailable until compatible sources are integrated. Gravity is a planetary reference value, not a local measurement.',
    route: '/compare',
    action: 'Review parameters',
  },
  {
    title: 'Generate a report',
    body: 'Export the current measured comparison as CSV or PDF. The report includes missing-data notes, source provenance, and calculation limitations.',
    route: '/reports',
    action: 'Open Reports',
  },
  {
    title: 'Explore data and methods',
    body: 'Read the source products, equations, sampling window, and known limitations before interpreting a result.',
    route: '/data-methodology',
    action: 'Read methodology',
  },
]

export default function TutorialModal({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = tutorialSteps[stepIndex]
  const isLast = stepIndex === tutorialSteps.length - 1

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setStepIndex((index) => Math.min(tutorialSteps.length - 1, index + 1))
      if (event.key === 'ArrowLeft') setStepIndex((index) => Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="tutorial-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div className="tutorial-topline">
          <span><BookOpen size={16} /> TERRA field guide</span>
          <button type="button" className="icon-button" aria-label="Close tutorial" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="eyebrow accent">Step {stepIndex + 1} of {tutorialSteps.length}</p>
        <h2 id="tutorial-title">{step.title}</h2>
        <p className="tutorial-body">{step.body}</p>
        <div className="tutorial-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin={1} aria-valuemax={tutorialSteps.length} aria-valuenow={stepIndex + 1}>
          <span style={{ width: `${((stepIndex + 1) / tutorialSteps.length) * 100}%` }} />
        </div>
        <div className="tutorial-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0}>
            <ArrowLeft size={16} /> Previous
          </button>
          <Link className="tutorial-route-link" to={step.route} onClick={onClose}>{step.action}</Link>
          {isLast
            ? <button type="button" className="btn btn-primary" onClick={onClose}>Finish</button>
            : <button type="button" className="btn btn-primary" onClick={() => setStepIndex((index) => Math.min(tutorialSteps.length - 1, index + 1))}>Next <ArrowRight size={16} /></button>}
        </div>
        <button type="button" className="tutorial-skip" onClick={onClose}>Skip tutorial</button>
      </section>
    </div>
  )
}
