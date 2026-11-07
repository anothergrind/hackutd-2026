import {
  Activity, BadgeCheck, Bot, Brain, Building2, CalendarClock, Check, CircleSlash, Clock, Gauge, History, Inbox,
  Mail, Moon, Pencil, Play, Radar, RotateCcw, Scale, Sparkles, Sun, Ticket, Truck, Users, Wrench, X, Zap,
  type LucideProps,
} from "lucide-react";

const icons = {
  activity: Activity, badge: BadgeCheck, bot: Bot, brain: Brain, building: Building2, calendar: CalendarClock, check: Check,
  slash: CircleSlash, clock: Clock, gauge: Gauge, history: History, inbox: Inbox, mail: Mail, moon: Moon, pencil: Pencil,
  play: Play, radar: Radar, reset: RotateCcw, scale: Scale, sparkles: Sparkles, sun: Sun, ticket: Ticket, truck: Truck,
  users: Users, wrench: Wrench, x: X, zap: Zap,
};

export type IconName = keyof typeof icons;

export default function Icon({ name, size = 16, ...rest }: { name: IconName } & LucideProps) {
  const C = icons[name];
  return <C size={size} strokeWidth={1.6} aria-hidden {...rest} />;
}
