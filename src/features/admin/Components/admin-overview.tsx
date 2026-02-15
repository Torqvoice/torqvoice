"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building2, CreditCard, DollarSign, Users } from "lucide-react";

type AdminStats = {
  totalUsers: number;
  totalOrganizations: number;
  totalActiveSubscriptions: number;
  totalRevenue: number;
};

export function AdminOverview({ stats }: { stats: AdminStats }) {
  const cards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
    },
    {
      title: "Organizations",
      value: stats.totalOrganizations,
      icon: Building2,
    },
    {
      title: "Active Subscriptions",
      value: stats.totalActiveSubscriptions,
      icon: CreditCard,
    },
    {
      title: "Monthly Revenue",
      value: `$${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
