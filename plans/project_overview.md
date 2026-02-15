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

- First user that register on application should automatically be super admin.
- In the new super admin page, add new sidebar authentication and add option to disable new user registrations. also add other options that
  you think is usefull for super admin for this type of applications.
- Add email settings for super admin to set app wider email smtp setup with test mail function. this has to include all settings for smtp, tls starttls and so on. look online so we get all settings correct. 