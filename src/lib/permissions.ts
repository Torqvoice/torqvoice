export enum PermissionAction {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage",
}

export enum PermissionSubject {
  DASHBOARD = "dashboard",
  VEHICLES = "vehicles",
  CUSTOMERS = "customers",
  WORK_ORDERS = "work_orders",
  QUOTES = "quotes",
  SERVICES = "services",
  BILLING = "billing",
  INVENTORY = "inventory",
  REPORTS = "reports",
  SETTINGS = "settings",
}

export type PermissionInput = {
  action: PermissionAction;
  subject: PermissionSubject;
};

export type PermissionGroup = {
  name: string;
  subject: PermissionSubject;
  permissions: {
    action: PermissionAction;
    label: string;
  }[];
};

export const permissionGroups: PermissionGroup[] = [
  {
    name: "Dashboard",
    subject: PermissionSubject.DASHBOARD,
    permissions: [
      { action: PermissionAction.READ, label: "View" },
    ],
  },
  {
    name: "Vehicles",
    subject: PermissionSubject.VEHICLES,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Customers",
    subject: PermissionSubject.CUSTOMERS,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Work Orders",
    subject: PermissionSubject.WORK_ORDERS,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Quotes",
    subject: PermissionSubject.QUOTES,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Services",
    subject: PermissionSubject.SERVICES,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Billing",
    subject: PermissionSubject.BILLING,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Inventory",
    subject: PermissionSubject.INVENTORY,
    permissions: [
      { action: PermissionAction.CREATE, label: "Create" },
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
      { action: PermissionAction.DELETE, label: "Delete" },
    ],
  },
  {
    name: "Reports",
    subject: PermissionSubject.REPORTS,
    permissions: [
      { action: PermissionAction.READ, label: "View" },
    ],
  },
  {
    name: "Settings",
    subject: PermissionSubject.SETTINGS,
    permissions: [
      { action: PermissionAction.READ, label: "View" },
      { action: PermissionAction.UPDATE, label: "Edit" },
    ],
  },
];

export function hasPermission(
  userPermissions: { action: string; subject: string }[],
  required: PermissionInput,
): boolean {
  return userPermissions.some(
    (p) => p.action === required.action && p.subject === required.subject,
  );
}

export function hasAllPermissions(
  userPermissions: { action: string; subject: string }[],
  required: PermissionInput[],
): boolean {
  return required.every((req) => hasPermission(userPermissions, req));
}
