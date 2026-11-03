import { CHECK_PLAN_JOB } from '@/features/integrations/Lib/repair-data-contract'
import { DEFAULT_PREFS } from '@/features/integrations/Lib/repair-prefs'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * The variable that holds a key the server uses for every workshop, for
 * when Torqvoice pays for Open Labor Project on the workshops' behalf.
 * Unset, every workshop brings its own key. Set, a workshop that leaves its
 * key empty uses this one, and answers fetched with it serve every workshop.
 */
export const SERVER_KEY_ENV = 'OPEN_LABOR_PROJECT_API_KEY'

/**
 * Open Labor Project: book times and fluid capacities, mostly for
 * US-market vehicles (a 2014 Ford Kuga came back as Australian data), through
 * the workshop's own API key. A lookup happens when
 * somebody opens the labor guide on a work order or a quote; the one job
 * that runs on its own is the daily check that stored answers may still be
 * kept.
 */
export const manifest: ConnectorManifest = {
  id: 'openlaborproject',
  name: 'Open Labor Project',
  category: 'repair',
  countries: ['US', 'CA'],
  logo: '/images/integrations/openlaborproject.svg',
  docs: '/docs/integrations/openlaborproject',
  auth: {
    type: 'api-key',
    fields: [
      {
        key: 'apiKey',
        label: 'apiKey',
        type: 'password',
        required: true,
        help: 'apiKeyHelp',
        serverKeyEnv: SERVER_KEY_ENV,
        serverKeyHelp: 'apiKeyServerHelp',
      },
    ],
  },
  capabilities: ['repair.labor', 'repair.fluids'],
  settings: [
    {
      key: 'minConfidence',
      type: 'select',
      label: 'minConfidence',
      help: 'minConfidenceHelp',
      default: DEFAULT_PREFS.minConfidence,
      options: [
        { value: 'all', label: 'confidenceAll' },
        { value: 'medium', label: 'confidenceMedium' },
        { value: 'high', label: 'confidenceHigh' },
        { value: 'oem', label: 'confidenceOem' },
      ],
    },
    {
      key: 'hoursFrom',
      type: 'select',
      label: 'hoursFrom',
      help: 'hoursFromHelp',
      default: DEFAULT_PREFS.hoursFrom,
      options: [
        { value: 'book', label: 'hoursBook' },
        { value: 'high', label: 'hoursHigh' },
      ],
    },
    {
      key: 'adjustPercent',
      type: 'number',
      label: 'adjustPercent',
      help: 'adjustPercentHelp',
      default: DEFAULT_PREFS.adjustPercent,
    },
    {
      key: 'rounding',
      type: 'select',
      label: 'rounding',
      help: 'roundingHelp',
      default: DEFAULT_PREFS.rounding,
      options: [
        { value: 'none', label: 'roundNone' },
        { value: '0.1', label: 'roundTenth' },
        { value: '0.25', label: 'roundQuarter' },
        { value: '0.5', label: 'roundHalf' },
      ],
    },
    {
      key: 'fluids',
      type: 'boolean',
      label: 'fluids',
      help: 'fluidsHelp',
      default: DEFAULT_PREFS.fluids,
    },
    {
      key: 'units',
      type: 'select',
      label: 'units',
      help: 'unitsHelp',
      default: DEFAULT_PREFS.units,
      options: [
        { value: 'both', label: 'unitsBoth' },
        { value: 'metric', label: 'unitsMetric' },
        { value: 'us', label: 'unitsUs' },
      ],
      showWhen: { key: 'fluids', equals: true },
    },
  ],
  schedules: [{ job: CHECK_PLAN_JOB, everyMinutes: 24 * 60 }],
}
