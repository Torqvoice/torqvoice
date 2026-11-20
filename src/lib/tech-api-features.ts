/**
 * What this server can do for the technician app, by name.
 *
 * The app is installed from a store and the server by whoever runs the
 * workshop, so the two are rarely the same age. A newer app talking to an
 * older self-hosted server has no way to know which of its screens will work,
 * and finds out by failing in front of a technician. With this list it asks
 * instead, and what the server does not name it switches off with a note.
 *
 * Add a name when the app has to behave differently without it. Never remove
 * or rename one: an installed app looks for the exact string.
 *
 * - `job-video`: videos on a job play in the app (the file route answers byte
 *   ranges), a video may be up to 250 MB and is scaled down to 1080p, and the
 *   job carries each attachment's description.
 * - `checkin`: a job's check-in under `/jobs/:id/checkin`: mileage, drop-off
 *   photos by position and the condition map with its marks. A booking is
 *   on the job list from its day on.
 * - `job-documents`: a PDF of up to 25 MB can be attached to a job, and is
 *   filed with the job's documents.
 * - `job-reference`: a job carries `customerReference`, the customer's own
 *   reference or purchase order number for it. Null when the job has none or
 *   the workshop does not use the field.
 * - `vehicle-fleet-number`: a job's vehicle carries `fleetNumber`, the
 *   workshop's own fleet or unit number for it. Null when the vehicle has
 *   none or the workshop does not use the field.
 * - `vehicle-meters`: a job carries `meters`, the vehicle's meters besides
 *   the odometer (engine hours, PTO hours) with this job's reading of each
 *   and the last one before it; empty when the workshop records none.
 *   `/jobs/:id/meters` reads them and takes readings (PUT), decimals allowed;
 *   a reading below the last one is kept and reported, never refused.
 */
export const TECH_API_FEATURES = [
  'job-video',
  'checkin',
  'job-documents',
  'job-reference',
  'vehicle-fleet-number',
  'vehicle-meters',
] as const
