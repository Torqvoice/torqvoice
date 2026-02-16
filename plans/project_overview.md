This application will take over for Lubelog and Invoice Ninja, providing a more comprehensive solution for repair shops to manage their work orders, invoices, and customer interactions. The goal is to create a user-friendly platform that streamlines the repair process and enhances communication between repair shops and their customers.


/app directory should only contain routes with server components. Pages should allways be loaded with server components to fetch data before rendering.

Client components should allways be placed in the /features directory. Features should be organized by domain, with each feature having its own subdirectory. Each feature directory can contain components, hooks, styles, actions and tests related to that specific feature.

For server actions, use one action pr file, so each file will be named after the action it contains.

Data Fetching
Data fetching should be done in server components using async/await syntax. This ensures that data is fetched before the component is rendered, improving performance and user experience.

If a client component needs to fetch data, use react-query for efficient data fetching and caching. Allways use zod for schema validation when fetching data.

All server actions should be wrapped with withAuth to ensure that only authenticated users can perform actions that modify data.

For submenus, use same layout as /settings were we have a child sidebar.

Task List:

  1. Recurring invoices

  Common for fleet customers or maintenance contracts. Currently there's no way to schedule automatic invoice generation.

  2. Billing page shows payment status but filters in memory

  getBillingHistory fetches all records then filters by payment status in JS. Should be a database query for performance at scale.

  3. No rate limiting on public invoice endpoints

  /share/invoice/[orgId]/[token] is open to the internet with no rate limiting. Easy to add middleware.

  4. Reports are basic

  Only revenue by month and by service type. Missing: technician productivity, average job time, most common services, customer retention,
  parts usage.

  5. No calendar/scheduling view

  Shops need to see upcoming appointments. A simple calendar view using existing service records + reminders would be very useful.

  10. Console.log cleanup in API routes

  Several API routes use console.log/console.error for error handling. Replace with a proper
  logger or remove for production. Low effort, improves production hygiene.