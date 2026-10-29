import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react"
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock3,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Pencil,
  Search,
  Scissors,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
  AlertCircle,
  LoaderCircle,
  Store,
  MapPin,
  Building2,
  ArrowUpRight,
  Star,
  MessageSquare,
  type LucideIcon,
} from "lucide-react"
import {
  approveSubscriptionPayment,
  checkoutAppointment,
  connectFirebase,
  activateStarterTrial,
  createAppointment,
  assignAppointmentProvider,
  createPaidWalkIn,
  createPayrollStatement,
  createRecord,
  createTeamAccount,
  friendlyError,
  markNotificationsRead,
  publishServiceProvider,
  registerCustomer,
  resetPassword,
  changeOwnPassword,
  requestOwnPasswordReset,
  subscribeAccountSecurity,
  subscribeWorkspaceAccess,
  readWorkspaceAccess,
  subscribeSubscriptionState,
  reflectExistingSubscriptionAccess,
  manageShopSubscription,
  rejectSubscriptionPayment,
  updateTeamMemberName,
  roles,
  saveBusinessSettings,
  saveShopSmsNumber,
  subscribeShopSmsSettings,
  signInUser,
  signInGoogle,
  signOutUser,
  submitSubscriptionPayment,
  subscribeBusinessSettings,
  subscribeNotifications,
  subscribeFeedback,
  submitFeedback,
  reviewFeedback,
  subscribeRecords,
  subscribeProviderAppointments,
  subscribeUserProfile,
  subscribeUsers,
  teamRoles,
  updateAccountProfile,
  updateAppointmentStatus,
  submitAppointmentReview,
  updateRecord,
  readAdminShopRecord,
  editAdminShopRecord,
  deleteShopRecord,
  updateUserRole,
  createBusinessShop,
  selectCustomerShop,
  setBusinessContext,
  subscribeShop,
  subscribeShopDirectory,
  subscribeAdministratorShops,
  selectAdministratorShop,
  type ShopProfile,
  type SmartCutRecord,
  type SyncState,
  type TeamAccount,
  type TeamRole,
  type UserProfile,
  type UserRole,
  type AccountSecurity,
} from "../firebase"
import {
  bookingSlots,
  appointmentStatus,
  awaitingPayment,
  completedReviewEntries,
  filterReviewEntries,
  manilaDate,
  moneyNumber,
  peso,
  serviceIdentity,
  subscriptionPeriodEnd,
  type BookingInput,
  type ReviewFilters,
} from "../domain"
import {
  isServiceImageUrl,
  uploadServiceImage,
  validateServiceImage,
} from "../cloudinary"
import smartCutLogo from "../imports/smartcut-logo.png"
import gcashPaymentQr from "../imports/gcash-qr.png"
import { readReceiptReference } from "../receipt"
import gcashPaymentImage from "../imports/image-5.png"
import EnterpriseCaptcha from "../EnterpriseCaptcha"
import { requiresCaptcha } from "../captcha-policy.mjs"
import { formatShopHours } from "../shop-hours.mjs"
import { normalizeFacebookPageUrl } from "../facebook-page.mjs"
import { walkInPaymentMethods } from "../walk-ins.mjs"
import { combinedFinance, reconcileFinance, financeDate, financeRange, providerEarnings, percentagePay } from "../finance"
import { downloadPdf } from "../pdf-export.mjs"
import { formatTime12, parseTime24, timeTo24, formatNotificationTime, formatDateManila, formatTimestampManila, timestampMillis } from "../time-format.mjs"
import { workspaceAccess, billingDeadline, addBillingMonth } from "../subscription-access.mjs"
import { adminRecordDate, adminRecordTime, recordEditFields } from "../admin-records"

type Page = "Overview" | "Appointments" | "Ratings & Reviews" | "Services" | "Customers" | "Team" | "Payments" | "Payroll" | "Analytics" | "Subscription" | "Settings" | "Feedback"
type CollectionState = {
  records: SmartCutRecord[]
  status: SyncState
  error?: string
}
type Service = {
  id: string
  name: string
  category: string
  amount: number
  durationMinutes: number
  status: string
  legacy: boolean
  sourceCatalogId?: string
  imageUrl?: string
  imagePublicId?: string
}
const defaultServiceCategories = {
  "Classic Haircut": "Haircuts",
  "Kids Haircut": "Haircuts",
  "Senior Haircut": "Haircuts",
  "Hair Styling": "Hair Styling",
  "Blow Dry": "Hair Styling",
  "Hair Coloring": "Hair Color",
  Highlights: "Hair Color",
  Balayage: "Hair Color",
  "Hair Treatment": "Hair Care",
  "Scalp Treatment": "Hair Care",
  Manicure: "Nails",
  Pedicure: "Nails",
  "Gel Manicure": "Nails",
  "Gel Pedicure": "Nails",
  "Basic Facial": "Skin Care",
  "Deep Cleansing Facial": "Skin Care",
  "Beard Trim": "Grooming",
  "Hot Towel Shave": "Grooming",
  "Eyebrow Threading": "Grooming",
  Waxing: "Grooming",
} as const
const defaultServiceNames = Object.keys(defaultServiceCategories)
const defaultCategories = [...new Set(Object.values(defaultServiceCategories))]
const subscriptionPlans = [
  {
    id: "starter",
    name: "Starter",
    amount: 99,
    description: "A simple start for your salon. Try it free for 7 days.",
    trialDays: 7,
    featured: false,
  },
  {
    id: "professional",
    name: "Professional",
    amount: 399,
    description: "A complete operating workspace for established teams.",
    trialDays: 0,
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    amount: 599,
    description: "Premium operations for larger salon and grooming businesses.",
    trialDays: 0,
    featured: false,
  },
] as const
const modules: {
  page: Page
  icon: LucideIcon
  group?: string
}[] = [
  { page: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { page: "Appointments", icon: CalendarDays },
  { page: "Ratings & Reviews", icon: Star },
  { page: "Services", icon: Scissors },
  { page: "Customers", icon: Users, group: "PEOPLE" },
  { page: "Team", icon: Users },
  { page: "Payroll", icon: Wallet, group: "BUSINESS" },
  { page: "Payments", icon: CreditCard },
  { page: "Analytics", icon: TrendingUp },
  { page: "Subscription", icon: Crown, group: "PREFERENCES" },
  { page: "Settings", icon: Settings2 },
  { page: "Feedback", icon: MessageSquare },
]
const managementPages = modules.map((item) => item.page)
const pageLabel = (page: Page, role: UserRole) =>
  page === "Feedback" ? role === "Administrator" ? "Feedback inbox" : "Report a problem"
    : page === "Payments" && isManager(role) ? "Sales & Payments" : page
const rolePages: Record<UserRole, Page[]> = {
  Administrator: managementPages,
  Manager: managementPages,
  "Service Provider": [
    "Overview",
    "Appointments",
    "Ratings & Reviews",
    "Services",
    "Customers",
    "Payroll",
    "Settings",
    "Feedback",
  ],
  Customer: ["Overview", "Appointments", "Services", "Payments", "Settings", "Feedback"],
}
const initialCollection: CollectionState = { records: [], status: "connecting" }
const cx = (...values: (string | false | undefined)[]) =>
  values.filter(Boolean).join(" ")
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
const slug = (page: Page) => page === "Ratings & Reviews" ? "reviews" : page.toLowerCase()
const isManager = (role: UserRole) =>
  role === "Administrator" || role === "Manager"
function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex size-9 shrink-0 overflow-hidden rounded-xl bg-white ${className}`}
    >
      <img
        src={smartCutLogo}
        alt="SmartCut logo"
        width={1024}
        height={1024}
        className="size-full object-contain"
      />
    </span>
  )
}
const numeric = (value: unknown) => {
  try {
    return moneyNumber(value)
  } catch {
    return 0
  }
}
const amountOf = (record: SmartCutRecord, legacyIndex = 5) =>
  record.amount !== undefined
    ? numeric(record.amount)
    : numeric(record.rows?.[legacyIndex])
const recordDate = (record: SmartCutRecord) => {
  if ((record.adminEditedAt || record.dateEditedAt) && record.date) return String(record.date)
  const stamp = record.createdAt as { toDate?: () => Date } | undefined
  return stamp?.toDate ? manilaDate(stamp.toDate()) : String(record.date || "")
}
const bookingAmount = (record: SmartCutRecord) =>
  record.amount !== undefined ? numeric(record.amount) : numeric(record.price)
const bookingClient = (record: SmartCutRecord) =>
  String(record.client || "Unnamed client")
const serviceOf = (record: SmartCutRecord): Service => ({
  id: record.id,
  name: String(record.name || record.rows?.[0] || "Untitled service"),
  category: String(record.category || record.rows?.[1] || "General"),
  durationMinutes: Number(
    record.durationMinutes || parseInt(record.rows?.[2] || "60"),
  ),
  amount: numeric(record.amount ?? record.rows?.[3]),
  status: String(record.status || "Needs review"),
  legacy: record.amount === undefined,
  imageUrl: isServiceImageUrl(record.imageUrl) ? record.imageUrl : "",
  imagePublicId: String(record.imagePublicId || ""),
})

function Button({
  children,
  icon: Icon,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon
  variant?: "primary" | "secondary" | "ghost" | "booking" | "walk-in" | "danger"
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-primary text-white hover:bg-primary/90"
          : variant === "booking"
            ? "bg-sky-700 text-white hover:bg-sky-800"
            : variant === "walk-in"
              ? "bg-amber-700 text-white hover:bg-amber-800"
              : variant === "danger"
                ? "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
              : variant === "secondary"
                ? "border border-border bg-card hover:bg-muted"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  )
}
function Badge({ children }: { children: ReactNode }) {
  const text = String(children)
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold",
        ["Paid", "Completed", "Rated", "Accepted", "Active", "Connected"].includes(text)
          ? "bg-emerald-50 text-emerald-700"
          : ["Pending", "Unpaid", "Needs review"].includes(text)
            ? "bg-amber-50 text-amber-800"
            : ["Confirmed", "In Progress", "In Service"].includes(text)
              ? "bg-sky-50 text-sky-800"
              : text === "Rejected" ? "bg-rose-50 text-rose-800" : "bg-muted text-muted-foreground",
      )}
    >
      <span className="size-1 rounded-full bg-current" />
      {children}
    </span>
  )
}
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="text-xs font-normal leading-relaxed text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  )
}
const inputClass =
  "min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal placeholder:text-muted-foreground/70 disabled:bg-muted disabled:text-muted-foreground"
function TimePicker({ value, change, label, minutePrecision = false, disabled = false }: {
  value: string; change: (value: string) => void; label: string; minutePrecision?: boolean; disabled?: boolean
}) {
  const savedTime = parseTime24(value)
  const parts = savedTime || { hour: 9, minute: "00" }
  const hour = String(parts.hour % 12 || 12)
  const period = parts.hour >= 12 ? "PM" : "AM"
  const minutes = minutePrecision ? Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"))
    : [...new Set(["00", "15", "30", "45", parts.minute])].sort()
  return <div className="grid grid-cols-3 gap-2" role="group" aria-label={label}>
    <select className={inputClass} aria-label={`${label} hour`} value={hour} disabled={disabled} onChange={(event) => change(timeTo24(event.target.value, parts.minute, period))}>
      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
    <select className={inputClass} aria-label={`${label} minute`} value={parts.minute} disabled={disabled} onChange={(event) => change(timeTo24(hour, event.target.value, period))}>
      {minutes.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
    <select className={inputClass} aria-label={`${label} AM or PM`} value={period} disabled={disabled} onChange={(event) => change(timeTo24(hour, parts.minute, event.target.value))}>
      <option value="AM">AM</option><option value="PM">PM</option>
    </select>
    {!savedTime && <div className="col-span-3"><ErrorBox message="The saved time is invalid. Choose the correct hour, minute, and AM/PM before saving." /></div>}
  </div>
}
function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-red-50 p-3 text-xs leading-relaxed text-destructive"
    >
      <AlertCircle className="mt-0.5 shrink-0" size={15} />
      {message}
    </div>
  )
}
function Empty({
  icon: Icon = CalendarDays,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-xl bg-secondary text-primary">
        <Icon size={22} />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
function useRouteMessage(scope: string) {
  const visit = useRef({ scope, revision: 0 })
  if (visit.current.scope !== scope) {
    visit.current = { scope, revision: visit.current.revision + 1 }
  }
  const revision = visit.current.revision
  const [value, setValue] = useState({ revision, message: "" })
  return [
    value.revision === revision ? value.message : "",
    (message: string) => setValue({ revision, message }),
  ] as const
}

function DataBoundary({
  state,
  children,
}: {
  state: CollectionState
  children: ReactNode
}) {
  if (state.status === "error")
    return (
      <div className="p-4">
        <ErrorBox message={state.error || "Unable to load Firebase records."} />
      </div>
    )
  if (state.status === "connecting" && !state.records.length)
    return (
      <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
        <LoaderCircle size={15} className="motion-safe:animate-spin" />
        Waiting for live Firebase data…
      </div>
    )
  return (
    <>
      {state.status === "connecting" && (
        <span
          role="status"
          className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"
        >
          <LoaderCircle size={14} className="motion-safe:animate-spin" />
          Syncing latest records. Actions become available after server confirmation.
        </span>
      )}
      {children}
    </>
  )
}
function Modal({
  title,
  subtitle,
  close,
  busy = false,
  children,
}: {
  title: string
  subtitle?: string
  close: () => void
  busy?: boolean
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    document.body.classList.add("overflow-hidden")
    const first = panel.current?.querySelector<HTMLElement>(
      "input, select, button, textarea",
    )
    first?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeRef.current()
      if (event.key !== "Tab") return
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
      )
      if (!focusable?.length) return
      const firstItem = focusable[0]
      const lastItem = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener("keydown", keyboard)
    return () => {
      document.body.classList.remove("overflow-hidden")
      document.removeEventListener("keydown", keyboard)
      previous?.focus()
    }
  }, [busy])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar/60 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) close()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="dialog-title" className="font-display text-base font-bold">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <Button
            variant="ghost"
            icon={X}
            aria-label="Close dialog"
            disabled={busy}
            onClick={close}
          />
        </div>
        {children}
      </div>
    </div>
  )
}
function download(name: string, columns: string[], rows: string[][], details: string[][] = []) {
  void downloadPdf(name, columns, rows, details).catch(() => {
    window.alert("The PDF could not be generated. Please try exporting again.")
  })
}
function PageHead({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-[22px] font-bold">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}
function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string
  note: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon size={16} className="text-primary" />
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-[14px] text-muted-foreground">{note}</p>
    </div>
  )
}

function WorkspaceClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  return <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
    <span>{now.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
    <span className="inline-flex items-center gap-1 tabular-nums"><Clock3 size={12} />{now.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true })} · PH</span>
  </span>
}

function AuthScreen() {
  const captchaRequired = requiresCaptcha(window.location.hostname)
  const [mode, setMode] = useState<"login" | "register" | "reset">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [captchaError, setCaptchaError] = useState("")
  const [captchaResetVersion, setCaptchaResetVersion] = useState(0)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (mode !== "reset" && captchaRequired && !captchaToken) {
      setError("Please complete the CAPTCHA before continuing.")
      return
    }
    setError("")
    setSuccess("")
    if (mode === "register" && password !== confirm) {
      setError("Your passwords do not match.")
      return
    }
    setBusy(true)
    try {
      if (mode === "register") await registerCustomer(name, email, password, captchaToken)
      else if (mode === "reset") {
        await resetPassword(email)
        setSuccess(
          "If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.",
        )
      } else await signInUser(email, password, captchaToken, rememberMe)
    } catch (failure) {
      setError(friendlyError(failure))
    } finally {
      if (mode !== "reset") {
        setCaptchaToken("")
        setCaptchaResetVersion((version) => version + 1)
      }
      setBusy(false)
    }
  }
  const continueWithGoogle = async () => {
    if (busy) return
    if (captchaRequired && !captchaToken) {
      setError("Please complete the CAPTCHA before continuing.")
      return
    }
    setBusy(true)
    setError("")
    setSuccess("")
    try {
      await signInGoogle(captchaToken, rememberMe)
    } catch (failure) {
      setError(friendlyError(failure))
    } finally {
      setCaptchaToken("")
      setCaptchaResetVersion((version) => version + 1)
      setBusy(false)
    }
  }
  const changeMode = (next: typeof mode) => {
    setMode(next)
    setError("")
    setSuccess("")
    setCaptchaToken("")
    setCaptchaError("")
    setCaptchaResetVersion((version) => version + 1)
  }
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-sidebar lg:grid-cols-[1.1fr_1fr] lg:grid-rows-1">
      <section className="relative flex flex-col justify-between overflow-hidden px-5 py-4 text-white sm:px-12 sm:py-7 lg:p-14">
        <img
          src="/images/smartcut-landing-photo.png"
          alt="Modern salon interior with styling chairs and illuminated mirrors"
          className="absolute inset-0 size-full object-cover object-center"
          fetchPriority="high"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-sidebar/80" />
        <div className="relative flex items-center gap-3">
          <BrandLogo className="size-16" />
          <span className="font-display text-xl font-bold">
            SmartCut
            <span className="ml-2 text-[14px] font-medium tracking-widest text-white/40">
              STUDIO OS
            </span>
          </span>
        </div>
        <div className="relative my-10 hidden max-w-lg sm:block lg:my-20">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[14px] tracking-wider text-white/70">
            <span className="size-1.5 rounded-full bg-emerald-200" />
            YOUR BUSINESS. IN RHYTHM.
          </span>
          <h1 className="font-display text-4xl font-semibold leading-[1.18] sm:text-5xl">
            Great style.
            <br />
            Better <span className="text-emerald-200">care.</span>
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/55">
            A considered workspace for the people behind every great cut, color,
            and customer experience.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
            {[
              [CalendarDays, "Every booking"],
              [Wallet, "Every peso"],
              [Users, "Every person"],
            ].map(([Icon, label]) => {
              const ItemIcon = Icon as LucideIcon
              return (
                <div key={String(label)}>
                  <ItemIcon size={19} className="mb-2 text-emerald-200" />
                  <span className="text-xs text-white/70">{String(label)}</span>
                </div>
              )
            })}
          </div>
        </div>
        <p className="relative hidden text-xs text-white/60 lg:block">
          Built for salons, barbershops, and grooming businesses in the
          Philippines.
        </p>
      </section>
      <section className="flex items-center justify-center bg-background px-5 py-6 sm:px-8 lg:py-12">
        <div className="w-full max-w-[480px]">
          <h2 className="font-display text-3xl font-bold">
            {mode === "register"
              ? "Make yourself at home."
              : mode === "reset"
                ? "Reset your password."
                : "Welcome back."}
          </h2>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            {mode === "register"
              ? "Create a Customer account to book your next visit."
              : mode === "reset"
                ? "We’ll send a reset link to your account email."
                : "Sign in and pick up where you left off."}
          </p>
          {mode !== "reset" && (
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
              {(["login", "register"] as const).map((item) => (
                <button
                  disabled={busy}
                  key={item}
                  className={cx(
                    "rounded-md py-3 text-sm font-semibold",
                    mode === item
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground",
                  )}
                  onClick={() => changeMode(item)}
                >
                  {item === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="grid gap-4">
            <fieldset disabled={busy} className="grid gap-4">
              {mode === "register" && (
                <Field
                  label="Full name"
                  hint="This name appears on your bookings."
                >
                  <input
                    autoComplete="name"
                    minLength={2}
                    maxLength={120}
                    required
                    className={inputClass}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Maria Santos"
                  />
                </Field>
              )}
              <Field label="Email address">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className={inputClass}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
              {mode !== "reset" && (
                <Field
                  label="Password"
                  hint={
                    mode === "register"
                      ? "Use at least 8 characters. A unique passphrase is best."
                      : undefined
                  }
                >
                  <input
                    type="password"
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    minLength={mode === "register" ? 8 : undefined}
                    required
                    className={inputClass}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                  />
                </Field>
              )}
              {mode === "register" && (
                <Field label="Confirm password">
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    className={inputClass}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Re-enter your password"
                  />
                </Field>
              )}
            </fieldset>
            {mode === "login" && (
              <Button
                variant="ghost"
                role="checkbox"
                aria-checked={rememberMe}
                disabled={busy}
                onClick={() => setRememberMe((value) => !value)}
                className="justify-start px-0 text-foreground"
              >
                <span
                  aria-hidden="true"
                  className={cx("flex size-4 items-center justify-center rounded border", rememberMe ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
                >
                  {rememberMe && <Check size={12} />}
                </span>
                Remember me on this device
              </Button>
            )}
            {captchaRequired && <div hidden={mode === "reset"}>
              <EnterpriseCaptcha
                resetVersion={captchaResetVersion}
                onToken={setCaptchaToken}
                onError={setCaptchaError}
              />
            </div>}
            {captchaRequired && mode !== "reset" && captchaError && <ErrorBox message={captchaError} />}
            {error && <ErrorBox message={error} />}
            {success && (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-700"
              >
                {success}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy || (mode !== "reset" && captchaRequired && !captchaToken)}
              icon={busy ? LoaderCircle : ArrowRight}
              className="min-h-11"
            >
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create Customer account"
                  : mode === "reset"
                    ? "Send reset link"
                    : "Sign in to workspace"}
            </Button>
            {mode !== "reset" && (
              <Button
                variant="secondary"
                disabled={busy || (captchaRequired && !captchaToken)}
                onClick={continueWithGoogle}
                className="w-full"
              >
                Continue with Google
              </Button>
            )}
          </form>
          <button
            disabled={busy}
            className="mt-4 text-xs text-primary hover:underline"
            onClick={() => changeMode(mode === "reset" ? "login" : "reset")}
          >
            {mode === "reset" ? "Back to sign in" : "Forgot your password?"}
          </button>
          {mode === "register" && (
            <div className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Staff access is assigned by an Administrator or Manager. Registration does not grant business permissions.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function useWorkspaceData(account: UserProfile, accessRevision = "", checkAccess?: () => Promise<boolean>) {
  const [retryKey, setRetryKey] = useState(0)
  const checkAccessRef = useRef(checkAccess)
  checkAccessRef.current = checkAccess
  const scope = `${account.uid}|${account.role}|${account.activeShopId || account.shopId || ""}|${accessRevision}|${retryKey}`
  const [loadedScope, setLoadedScope] = useState("")
  const [data, setData] = useState<Record<string, CollectionState>>({})
  const [business, setBusiness] = useState<Record<string, unknown>>({})
  const [businessStatus, setBusinessStatus] =
    useState<CollectionState>(initialCollection)
  const [users, setUsers] = useState<TeamAccount[]>([])
  const [usersStatus, setUsersStatus] =
    useState<CollectionState>(initialCollection)
  useEffect(() => {
    let active = true
    let accessConfirmation: Promise<boolean> | undefined
    const reconcileError = (error: string | undefined, showError: () => void, isCurrent = () => true) => {
      if (!/access denied|permission/i.test(error || "") || !checkAccessRef.current) return false
      // Share only an in-flight check, never a past license decision.
      accessConfirmation ||= checkAccessRef.current().finally(() => { accessConfirmation = undefined })
      void accessConfirmation.then((locked) => {
        if (active && isCurrent() && !locked) showError()
      }).catch(() => { if (active && isCurrent()) showError() })
      return true
    }
    setBusinessContext(account.role === "Manager" || account.role === "Service Provider"
      ? account.shopId || ""
      : account.activeShopId || account.shopId || "")
    setData({})
    setBusiness({})
    setUsers([])
    setUsersStatus(initialCollection)
    setBusinessStatus(initialCollection)
    setLoadedScope(scope)
    const names = ["appointments", "services", "team", "notifications", "promotions", "reviews"]
    if (account.role !== "Customer") names.push("clients")
    if (
      isManager(account.role) ||
      account.role === "Customer"
    )
      names.push("sales", "payments")
    if (isManager(account.role)) names.push("walkins")
    if (isManager(account.role))
      names.push(
        "payroll",
        "subscription",
        "catalog",
        "subscriptionPayments",
        "subscriptionPaymentRequests",
      )
    if (account.role === "Administrator") names.push("subscriptionEvents", "feedback")
    else if (account.role === "Service Provider") names.push("payroll")
    const stops = names.map((name) => {
      let statusRevision = 0
      const applyStatus = (state: SyncState, error?: string) => {
        if (!active) return
        setData((current) => ({
          ...current,
          [name]: {
            records: current[name]?.records || [],
            status: state,
            error,
          },
        }))
      }
      const status = (state: SyncState, error?: string) => {
        if (!active) return
        const revision = ++statusRevision
        if (state === "error" && reconcileError(error, () => applyStatus(state, error), () => revision === statusRevision)) {
          applyStatus("connecting")
          return
        }
        applyStatus(state, error)
      }
      const callback = (records: SmartCutRecord[]) => {
        if (!active) return
        setData((current) => ({
          ...current,
          [name]: {
            ...current[name],
            records,
            status: current[name]?.status || "connecting",
          },
        }))
      }
      if (name === "notifications")
        return subscribeNotifications(callback, status)
      if (name === "feedback")
        return subscribeFeedback(account.role, callback, status)
      if (name === "subscription")
        return subscribeSubscriptionState(callback, status)
      if (name === "appointments" && account.role === "Service Provider")
        return subscribeProviderAppointments(callback, status)
      const scope =
        account.role === "Service Provider" &&
        ["appointments", "payroll", "reviews"].includes(name)
          ? "provider"
          : account.role === "Customer" &&
              ["appointments", "payments", "sales", "reviews"].includes(name)
            ? "customer"
            : undefined
      return subscribeRecords(name, callback, status, scope)
    })
    let businessRevision = 0
    let usersRevision = 0
    stops.push(
      subscribeBusinessSettings((value) => { if (active) setBusiness(value) }, (status, error) => {
        if (!active) return
        const revision = ++businessRevision
        if (status === "error" && reconcileError(error, () => setBusinessStatus({ records: [], status, error }), () => revision === businessRevision)) {
          setBusinessStatus(initialCollection)
          return
        }
        setBusinessStatus({ records: [], status, error })
      },
      ),
    )
    if (isManager(account.role))
      stops.push(
        subscribeUsers(
          (users) => {
            if (!active) return
            ++usersRevision
            setUsers(users)
            setUsersStatus({ records: [], status: "connected" })
          },
          (error) => {
            if (!active) return
            const revision = ++usersRevision
            if (reconcileError(error, () => setUsersStatus({ records: [], status: "error", error }), () => revision === usersRevision)) {
              setUsersStatus(initialCollection)
              return
            }
            setUsersStatus({ records: [], status: "error", error })
          },
          (status) => { if (active) { ++usersRevision; setUsersStatus((current) => ({ ...current, status, error: undefined })) } },
        ),
      )
    return () => { active = false; stops.forEach((stop) => stop()) }
  }, [account.uid, account.role, account.activeShopId, account.shopId, retryKey, accessRevision])
  const readyScope = loadedScope === scope
  return { data: readyScope ? reconcileFinance(data) : {}, business: readyScope ? business : {}, businessStatus: readyScope ? businessStatus : initialCollection,
    users: readyScope ? users : [], usersStatus: readyScope ? usersStatus : initialCollection, reconnect: () => setRetryKey((value) => value + 1) }
}
type WorkspaceData = ReturnType<typeof useWorkspaceData>
type Action = (
  operation: () => Promise<unknown>,
  message: string,
) => Promise<void>

function Workspace() {
  const location = useLocation()
  const [account, setAccount] = useState<UserProfile | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState("")
  const [customerEntry, setCustomerEntry] = useState(false)
  useEffect(() => {
    if (["/shops", "/feedback"].includes(location.pathname)) setCustomerEntry(false)
  }, [location.pathname, customerEntry])
  useEffect(() => {
    let active = true
    let generation = 0
    let stopProfile: (() => void) | undefined
    const stopAuth = connectFirebase((user) => {
      if (!active) return
      const session = ++generation
      stopProfile?.()
      setAccount(null)
      setCustomerEntry(false)
      setAuthError("")
      setAuthenticated(!!user)
      setAuthLoading(!!user)
      if (!user) {
        setAuthLoading(false)
        return
      }
      let firstProfile = true
      stopProfile = subscribeUserProfile(
        user.uid,
        (profile) => {
          if (!active || session !== generation) return
          if (profile && firstProfile) {
            firstProfile = false
            setCustomerEntry(profile.role === "Customer")
          }
          setAccount(profile)
          setAuthLoading(false)
        },
        (message) => { if (active && session === generation) setAuthError(message) },
      )
    })
    return () => {
      active = false
      generation++
      stopProfile?.()
      stopAuth()
    }
  }, [])
  if (authLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="motion-safe:animate-spin" size={20} />
        Opening your workspace…
      </div>
    )
  if (!authenticated) return <AuthScreen />
  if (!account)
    return (
      <div className="grid min-h-dvh place-items-center p-5">
        <div className="max-w-md rounded-xl border border-border bg-card p-6">
          <ShieldCheck size={28} className="mb-4 text-primary" />
          <h1 className="font-display text-xl font-bold">
            Account setup required
          </h1>
          <p className="my-3 text-sm leading-relaxed text-muted-foreground">
            You are signed in, but a valid workspace profile could not be
            loaded. Ask your Administrator or Manager to verify your user
            profile and Firestore permissions.
          </p>
          {authError && <ErrorBox message={authError} />}
          <Button
            className="mt-4"
            onClick={() => {
              void signOutUser().catch((error) =>
                setAuthError(friendlyError(error)),
              )
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    )
  if (location.pathname === "/feedback") return <FeedbackPage account={account} />
  if (account.role === "Customer" && customerEntry && location.pathname !== "/shops")
    return <Navigate to="/shops" replace />
  return (
    <ShopContextGate
      key={`${account.uid}:${account.role}:${account.activeShopId || account.shopId || "unassigned"}`}
      account={account}
    />
  )
}

function ShopAvatar({
  shop,
  large = false,
  photo = false,
}: {
  shop: ShopProfile
  large?: boolean
  photo?: boolean
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [shop.logoUrl])
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/10 bg-secondary font-display font-bold text-primary",
        photo
          ? "aspect-[4/3] w-full text-4xl"
          : large ? "size-16 text-xl" : "size-12 text-base",
      )}
    >
      {shop.logoUrl && !failed ? (
        <img
          src={shop.logoUrl}
          alt={`${shop.name} logo`}
          className={cx("size-full", photo ? "object-contain p-2" : "object-cover")}
          onError={() => setFailed(true)}
        />
      ) : (
        initials(shop.name).slice(0, 2)
      )}
    </span>
  )
}

function ShopContextGate({ account }: { account: UserProfile }) {
  const location = useLocation()
  const navigate = useNavigate()
  const shopId =
    account.role === "Customer" ? account.activeShopId
      : account.role === "Administrator" ? account.activeShopId || account.shopId : account.shopId
  const [shop, setShop] = useState<ShopProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedShopId, setLoadedShopId] = useState("")
  const [error, setError] = useState("")
  const [access, setAccess] = useState<SmartCutRecord | null>(null)
  const [accessState, setAccessState] = useState<CollectionState>(initialCollection)
  const [accessNow, setAccessNow] = useState(Date.now())
  const [accessRetry, setAccessRetry] = useState(0)
  const wasLocked = useRef(false)
  const currentShop = useRef(shopId)
  currentShop.current = shopId
  useEffect(() => {
    if (!shopId) return
    let active = true
    setAccess(null)
    setAccessState(initialCollection)
    const stop = subscribeWorkspaceAccess(shopId, (record) => { if (active) { setAccess(record); setAccessNow(Date.now()) } },
      (status, error) => { if (active) setAccessState({ records: [], status, error }) })
    return () => { active = false; stop() }
  }, [shopId, account.uid, account.role, accessRetry])
  const accessEnd = billingDeadline(access)?.getTime()
  const licensing = workspaceAccess(access, accessNow)
  useEffect(() => {
    if (account.role === "Administrator" || account.role === "Customer" || accessState.status !== "connected") return
    if (!licensing.allowed) wasLocked.current = true
    else if (wasLocked.current) {
      wasLocked.current = false
      navigate(account.role === "Manager" && access?.status !== "Trial" ? "/subscription" : "/overview", { replace: true })
    }
  }, [account.role, accessState.status, licensing.allowed, access?.status, navigate])
  useEffect(() => {
    if (!accessEnd || accessEnd <= accessNow) return
    const timer = window.setTimeout(() => setAccessNow(Date.now()), Math.min(accessEnd - accessNow + 1, 60000))
    return () => window.clearTimeout(timer)
  }, [accessEnd, accessNow])
  useEffect(() => {
    if (!shopId) return
    let active = true
    setShop(null)
    setLoading(true)
    setError("")
    setLoadedShopId("")
    const stop = subscribeShop(
      shopId,
      (record) => {
        if (!active) return
        setShop(record)
        setLoadedShopId(shopId)
        setError("")
        setLoading(false)
      },
      (message) => {
        if (!active) return
        setError(message)
        setLoadedShopId(shopId)
        setLoading(false)
      },
    )
    return () => { active = false; stop() }
  }, [shopId, accessRetry])
  if (account.role === "Administrator" && (!shopId || location.pathname === "/shops"))
    return <AdministratorShopSelection account={account} />
  if (
    account.role === "Customer" &&
    (!shopId || location.pathname === "/shops")
  )
    return <ShopSelection account={account} />
  if (!shopId && isManager(account.role)) return <ShopSetup account={account} />
  if (!shopId)
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-border bg-card p-7">
          <Building2 className="mb-4 text-primary" size={32} />
          <PageHead
            title="Your shop assignment is missing"
            description="Ask your shop Administrator to assign this staff account to the correct business. No other shop’s data will be loaded."
          />
          <Button onClick={() => void signOutUser()}>Sign out</Button>
          <Button variant="secondary" icon={MessageSquare} onClick={() => navigate("/feedback")}>Report a problem</Button>
        </section>
      </div>
    )
  if (loading || loadedShopId !== shopId ||
    (account.role !== "Administrator" && account.role !== "Customer" && accessState.status === "connecting"))
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle size={20} className="animate-spin" />
        Opening your workspace…
      </div>
    )
  if (error || !shop)
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-border bg-card p-7">
          <PageHead
            title="This shop could not be opened"
            description="Your previous records have not been moved or deleted."
          />
          <ErrorBox
            message={
              error ||
              "The selected shop no longer has a directory entry. Contact its manager."
            }
          />
          {error.toLowerCase().includes("permission") && (
            <p className="mt-3 text-sm text-muted-foreground">
              This account cannot access the shop. Ask its manager to verify your membership and deploy the latest SmartCut Firestore rules.
            </p>
          )}
          <div className="mt-5 flex gap-2">
            {(account.role === "Customer" || account.role === "Administrator") && (
              <Button onClick={() => navigate("/shops")}>
                Choose another shop
              </Button>
            )}
            <Button variant="secondary" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
    )
  if (account.role !== "Administrator" && account.role !== "Customer") {
    if (accessState.status !== "connected") return <div className="grid min-h-dvh place-items-center p-6">
      <div className="grid max-w-md gap-4">
        <PageHead title="Workspace access could not be confirmed" description="Check your connection and retry. Your shop records have not been changed." />
        {accessState.error && <ErrorBox message={accessState.error} />}
        <Button variant="secondary" onClick={() => setAccessRetry((value) => value + 1)}>Retry connection</Button>
        <Button variant="ghost" onClick={() => void signOutUser()}>Sign out</Button>
      </div>
    </div>
    if (!licensing.allowed) return <LockedWorkspacePortal account={account} shop={shop} reason={licensing.reason} />
  }
  const accessRevision = account.role === "Administrator" ? "" :
    `${access?.planId || ""}|${access?.status || ""}|${access?.manualLocked === true}|${accessEnd || ""}`
  const checkAccess = account.role === "Manager" || account.role === "Service Provider" ? async () => {
    const record = await readWorkspaceAccess(shop.id)
    if (currentShop.current !== shop.id) return true
    setAccess(record)
    setAccessNow(Date.now())
    setAccessState({ records: [], status: "connected" })
    return !workspaceAccess(record).allowed
  } : undefined
  return <ConnectedWorkspace key={`${account.uid}:${account.role}:${shop.id}`} account={account} shop={shop}
    accessRevision={accessRevision} checkAccess={checkAccess} bookingAccessStatus={accessState.status} bookingAccessError={accessState.error}
    bookingAccess={account.role === "Administrator" || (accessState.status === "connected" && licensing.allowed)} />
}

function LockedWorkspacePortal({ account, shop, reason }: { account: UserProfile; shop: ShopProfile; reason: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<Record<string, CollectionState>>({})
  const [business, setBusiness] = useState<Record<string, unknown>>({})
  const [reflectionError, setReflectionError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    setBusinessContext(shop.id)
    if (!isManager(account.role)) return
    setData({})
    setBusiness({})
    setReflectionError("")
    let active = true
    const status = (name: string) => (status: SyncState, error?: string) =>
      { if (active) setData((current) => ({ ...current, [name]: { records: current[name]?.records || [], status, error } })) }
    const records = (name: string) => (records: SmartCutRecord[]) =>
      { if (active) setData((current) => ({ ...current, [name]: { ...current[name], records, status: current[name]?.status || "connecting" } })) }
    const stops = [
      subscribeSubscriptionState(records("subscription"), status("subscription")),
      subscribeRecords("subscriptionPaymentRequests", records("requests"), status("requests")),
      subscribeRecords("subscriptionPayments", records("payments"), status("payments")),
      subscribeBusinessSettings((value) => { if (active) setBusiness(value) }, status("business")),
    ]
    void reflectExistingSubscriptionAccess(shop.id).catch((error) => { if (active) setReflectionError(friendlyError(error)) })
    return () => { active = false; stops.forEach((stop) => stop()) }
  }, [shop.id, account.uid, account.role, retry])
  return <div className="min-h-dvh bg-background p-5 sm:p-8">
    <div className="mx-auto max-w-5xl">
      <PageHead title={`${shop.name} · Workspace locked`} description={reason}>
        <Button variant="secondary" icon={MessageSquare} onClick={() => navigate("/feedback")}>Report a problem</Button>
        <Button variant="secondary" onClick={() => void signOutUser()}>Sign out</Button>
      </PageHead>
      <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Your login and stored records are preserved. Only an Administrator can clear a manual lock or approve renewal access. Uploading a receipt alone does not unlock the workspace.
      </div>
      {reflectionError && <ErrorBox message={reflectionError} />}
      {isManager(account.role) ? <Subscription account={account} business={business}
        state={data.subscription || initialCollection} requests={data.requests || initialCollection} payments={data.payments || initialCollection}
        businessStatus={data.business || initialCollection} reconnect={() => setRetry((value) => value + 1)} /> :
        <Empty icon={ShieldCheck} title="Contact your shop manager" description="Your shop's subscription or requirements need Administrator review. Your assigned records have not been deleted." />}
      <section className="mt-6 rounded-xl border border-border bg-card p-5"><AccountSecuritySettings account={account} busy={false} /></section>
    </div>
  </div>
}

function AdministratorShopSelection({ account }: { account: UserProfile }) {
  const navigate = useNavigate()
  const [shops, setShops] = useState<ShopProfile[]>([])
  const [status, setStatus] = useState<SyncState>("connecting")
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("All shops")
  const [selected, setSelected] = useState<ShopProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const activeId = account.activeShopId || account.shopId
  useEffect(() => {
    setBusinessContext("")
    setError("")
    return subscribeAdministratorShops(setShops, (state, message) => {
      setStatus(state)
      if (message) setError(message)
    })
  }, [retry])
  const filtered = shops.filter(
    (shop) =>
      `${shop.name} ${shop.managerName} ${shop.location}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()) &&
      (filter === "All shops" ||
        (filter === "Active" ? shop.active : !shop.active)),
  )
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <span className="font-display text-xl font-bold">SmartCut.</span>
            <Badge>Administrator</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={MessageSquare} onClick={() => navigate("/feedback")}>Feedback inbox</Button>
            {activeId && (
              <Button variant="secondary" onClick={() => navigate("/overview")}>
                Back to workspace
              </Button>
            )}
            <Button
              variant="ghost"
              icon={LogOut}
              onClick={() => void signOutUser()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <PageHead
          title="Every shop. One command center."
          description="Choose a business to manage its team, customers, appointments, services, sales, payments, payroll, and settings."
        />
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/15 bg-secondary p-4 text-sm text-primary">
          <ShieldCheck size={20} className="shrink-0" />
          <p>
            Your Administrator role applies across all shops, including inactive
            businesses. Switching changes the workspace you manage, not shop
            ownership or the location of its records.
          </p>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Find a shop">
            <input
              className={inputClass}
              placeholder="Search shop, manager, or location…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Field label="Shop status">
            <select
              className={inputClass}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {["All shops", "Active", "Inactive"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && (
          <div className="mb-5">
            <ErrorBox message={error} />
            <Button
              variant="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry directory
            </Button>
          </div>
        )}
        {status === "connecting" && shops.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <LoaderCircle className="animate-spin" size={20} />
            Loading all shops…
          </div>
        ) : filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((shop) => (
              <section
                key={shop.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <ShopAvatar shop={shop} />
                  <Badge>{shop.active ? "Active" : "Inactive"}</Badge>
                </div>
                <h2 className="font-display text-lg font-bold">{shop.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Managed by {shop.managerName}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin size={14} />
                  {shop.location || "Location not provided"}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {shop.acceptingCustomers
                    ? "Accepting new customers"
                    : "New customer connections paused"}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <span className="text-xs text-primary">
                    {activeId === shop.id
                      ? "Current workspace"
                      : "Full Administrator access"}
                  </span>
                  <Button
                    icon={ArrowUpRight}
                    disabled={status !== "connected"}
                    onClick={() => {
                      setError("")
                      setSelected(shop)
                    }}
                  >
                    Manage shop
                  </Button>
                </div>
              </section>
            ))}
          </div>
        ) : status !== "error" ? (
          <Empty
            icon={Store}
            title={shops.length ? "No shops match your search" : "No shops yet"}
            description={
              shops.length
                ? "Try a different search or status filter."
                : "Shops will appear here once a Manager completes their shop setup."
            }
          />
        ) : null}
      </main>
      {selected && (
        <Modal
          title="Open this shop?"
          subtitle="Your Administrator access remains unchanged."
          busy={busy}
          close={() => {
            if (!busy) setSelected(null)
          }}
        >
          <div className="grid gap-4 p-5">
            <div className="flex items-center gap-3">
              <ShopAvatar shop={selected} />
              <div>
                <p className="font-semibold">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.managerName} · {selected.location}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              You will manage this shop’s records. Other businesses stay
              separate, and no records are moved.
            </p>
            {error && <ErrorBox message={error} />}
          </div>
          <div className="flex justify-end gap-2 border-t border-border p-4">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              icon={busy ? LoaderCircle : ShieldCheck}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                setError("")
                try {
                  await selectAdministratorShop(selected.id)
                  navigate("/overview", { replace: true })
                } catch (failure) {
                  setError(friendlyError(failure))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "Opening…" : "Open workspace"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ShopSelection({ account }: { account: UserProfile }) {
  const navigate = useNavigate()
  const [shops, setShops] = useState<ShopProfile[]>([])
  const [status, setStatus] = useState<SyncState>("connecting")
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState(account.activeShopId || "")
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const joinedKey = (account.joinedShopIds || []).join("|")
  useEffect(() => {
    setBusinessContext("")
    setError("")
    return subscribeShopDirectory(
      account.joinedShopIds || [],
      setShops,
      (state, message) => {
        setStatus(state)
        if (message) setError(message)
      },
    )
  }, [joinedKey, retry])
  const selected = shops.find((shop) => shop.id === selectedId)
  const joined = new Set(account.joinedShopIds || [])
  const eligible = shops.filter(
    (shop) => (shop.active && shop.acceptingCustomers) || joined.has(shop.id),
  )
  const filtered = eligible.filter(
    (shop) =>
      `${shop.name} ${shop.managerName} ${shop.location} ${(shop.serviceCategories || []).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const returning = !!account.activeShopId
  const connect = async () => {
    if (!selected || saving) return
    setSaving(true)
    setError("")
    try {
      await selectCustomerShop(selected.id)
      navigate("/overview", { replace: true })
    } catch (failure) {
      setError(friendlyError(failure))
      setSaving(false)
    }
  }
  return (
    <div data-shop-selection-flow className="relative isolate min-h-dvh bg-background">
      <style>{`
        @keyframes smartcut-shop-glow {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.85; }
        }
        @keyframes smartcut-booking-breathe {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes smartcut-booking-pill-breathe {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes smartcut-booking-sweep {
          0%, 30% { transform: translateX(-150%); }
          65%, 100% { transform: translateX(150%); }
        }
        [data-shop-selection-flow]::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background: radial-gradient(
            ellipse at 15% 35%,
            color-mix(in srgb, var(--primary) 12%, transparent),
            transparent 65%
          );
          animation: smartcut-shop-glow 8s ease-in-out infinite;
        }
        [data-shop-selection-flow] [data-booking-status="accepting"] {
          overflow: hidden;
          isolation: isolate;
          transform-origin: top right;
          animation: smartcut-booking-pill-breathe 3.6s ease-in-out infinite;
        }
        [data-shop-selection-flow] [data-booking-status="accepting"]::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background: linear-gradient(
            110deg, transparent,
            color-mix(in srgb, var(--primary-foreground) 22%, transparent),
            transparent
          );
          animation: smartcut-booking-sweep 5s ease-in-out infinite;
        }
        [data-shop-selection-flow] [data-booking-status="accepting"] > span {
          animation: smartcut-booking-breathe 2.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-shop-selection-flow]::before,
          [data-shop-selection-flow] [data-booking-status="accepting"],
          [data-shop-selection-flow] [data-booking-status="accepting"]::after,
          [data-shop-selection-flow] [data-booking-status="accepting"] > span {
            animation: none;
          }
        }
      `}</style>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <span className="font-display text-xl font-bold">
              SmartCut<span className="text-primary">.</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:block">{account.name}</span>
            <Button variant="ghost" icon={MessageSquare} onClick={() => navigate("/feedback")}>Report a problem</Button>
            <Button
              variant="ghost"
              icon={returning ? ArrowLeft : LogOut}
              onClick={() =>
                returning ? navigate("/overview") : void signOutUser()
              }
            >
              {returning ? "Back to my shop" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-7 flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-2 text-primary">
            <CheckCircle2 size={16} /> Account created
          </span>
          <span className="h-px w-8 bg-border" />
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid size-5 place-items-center rounded-full bg-primary text-[14px] text-white">
              2
            </span>{" "}
            Choose your shop
          </span>
          <span className="hidden h-px w-8 bg-border sm:block" />
          <span className="hidden text-muted-foreground sm:block">
            3 · Make it yours
          </span>
        </div>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-3 text-[14px] font-semibold uppercase tracking-[0.18em] text-primary">
              A good cut starts with a good connection
            </p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              {returning
                ? "Find your next favorite shop."
                : "Your style. Your people. Your shop."}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Choose a shop to discover its services, meet its team, and book
              your next visit. Your prices, appointments, and receipts stay
              together in one place.
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
            <ShieldCheck size={15} className="text-primary" />
            Your records stay with their original shop
          </span>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row">
              <div className="flex flex-1 items-center gap-3 px-2">
                <Search size={18} className="shrink-0 text-muted-foreground" />
                <input
                  aria-label="Search shops, managers, or locations"
                  placeholder="Search shop, manager, or location"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm"
                />
              </div>
            </div>
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {status === "connecting"
                  ? "Checking availability…"
                  : `${filtered.length} ${
                      filtered.length === 1 ? "shop" : "shops"
                    } to explore`}
              </span>
              <span>PHP · Asia/Manila</span>
            </div>
            {error && (
              <div className="mb-4">
                <ErrorBox message={error} />
                {status === "error" && (
                  <Button
                    variant="ghost"
                    className="mt-2"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Retry loading shops
                  </Button>
                )}
              </div>
            )}
            {status === "connecting" && shops.length === 0 ? (
              <div
                role="status"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-56 animate-pulse rounded-2xl border border-border bg-secondary/50"
                  />
                ))}
                <span className="sr-only">Loading available shops</span>
              </div>
            ) : filtered.length ? (
              <div
                role="radiogroup"
                aria-label="Choose a shop"
                className="grid gap-4 sm:grid-cols-2"
              >
                {filtered.map((shop) => {
                  const chosen = selectedId === shop.id
                  const existing = joined.has(shop.id)
                  const facebookPage = normalizeFacebookPageUrl(shop.facebookUrl || "")
                  const accepting = shop.active && shop.acceptingCustomers
                  return (
                    <div
                      key={shop.id}
                      className={cx(
                        "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                        chosen ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="relative border-b border-border bg-secondary [&>span:first-child]:aspect-video [&>span:first-child]:rounded-none [&>span:first-child]:border-0 [&>span:first-child>img]:object-cover [&>span:first-child>img]:p-0">
                        <ShopAvatar shop={shop} photo />
                        <span data-booking-status={accepting ? "accepting" : "inactive"} className={cx(
                          "absolute right-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold shadow-sm",
                          accepting ? "rounded-full border border-primary/30 bg-secondary/70 px-4 text-primary backdrop-blur-md" : "bg-card text-muted-foreground",
                        )}>
                          <span className="size-2 rounded-full bg-current opacity-70" />
                          {accepting ? "Accepting bookings" : shop.active ? "Existing customers only" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-lg font-bold leading-snug text-primary">{shop.name}</span>
                          {existing && <Badge>Connected</Badge>}
                        </div>
                        <span className="mt-2 text-xs leading-relaxed text-muted-foreground">Managed by {shop.managerName}</span>
                        <div className="mt-4 grid gap-3 text-sm">
                          {shop.location?.trim() ? (
                            <Button
                              variant="ghost"
                              aria-label={`View ${shop.name}'s location on Google Maps (opens in a new tab)`}
                              className="!min-h-0 !items-start !justify-start gap-2 !p-0 text-left text-sm font-medium text-primary hover:bg-transparent hover:underline"
                              onClick={() => window.open(
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.location.trim())}`,
                                "_blank", "noopener,noreferrer",
                              )}
                            >
                              <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <span className="min-w-0 leading-relaxed">{shop.location}</span>
                            </Button>
                          ) : (
                            <div className="flex items-start gap-2 text-muted-foreground">
                              <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <span className="leading-relaxed">Contact the shop for its location</span>
                            </div>
                          )}
                          <div className="flex items-start gap-2 text-muted-foreground">
                            <Clock3 size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                            <span className="leading-relaxed">{formatShopHours(shop.open, shop.close)}</span>
                          </div>
                          {facebookPage && (
                            <Button
                              variant="ghost"
                              aria-label={`Open ${shop.name}'s Facebook page in a new tab`}
                              className="!min-h-0 !items-start !justify-start gap-2 !p-0 text-left text-sm font-medium text-primary hover:bg-transparent hover:underline"
                              onClick={() => window.open(facebookPage, "_blank", "noopener,noreferrer")}
                            >
                              <ArrowUpRight size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <span className="leading-relaxed">Facebook page</span>
                            </Button>
                          )}
                        </div>
                        <div className="mb-5 mt-4 flex flex-wrap gap-1.5">
                          {(shop.serviceCategories || []).slice(0, 3).map((category) => (
                            <span key={category} className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-primary">{category}</span>
                          ))}
                        </div>
                        <Button
                          role="radio"
                          aria-checked={chosen}
                          aria-label={`Select ${shop.name}`}
                          tabIndex={chosen || (!filtered.some((item) => item.id === selectedId) && filtered[0].id === shop.id) ? 0 : -1}
                          onClick={() => { setSelectedId(shop.id); setError("") }}
                      onKeyDown={(event) => {
                        if (
                          ![
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                            "Home",
                            "End",
                          ].includes(event.key)
                        )
                          return
                        event.preventDefault()
                        const radios = [
                          ...(event.currentTarget
                            .closest('[role="radiogroup"]')
                            ?.querySelectorAll<HTMLButtonElement>(
                              '[role="radio"]',
                            ) || []),
                        ]
                        const index = radios.indexOf(event.currentTarget)
                        const nextIndex =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? radios.length - 1
                              : (index +
                                  (event.key === "ArrowLeft" ||
                                  event.key === "ArrowUp"
                                    ? -1
                                    : 1) +
                                  radios.length) %
                                radios.length
                        setSelectedId(filtered[nextIndex].id)
                        radios[nextIndex].focus()
                      }}
                          className="mt-auto w-full rounded-xl shadow-sm"
                          icon={chosen ? Check : ArrowRight}
                        >
                          {chosen ? "Selected shop" : "Choose this shop"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <section className="rounded-2xl border border-dashed border-border bg-card py-10">
                <Empty
                  icon={Store}
                  title={
                    search
                      ? "No shops match your search"
                      : "No shops are accepting customers yet"
                  }
                  description={
                    search
                      ? "Try another name, location, or specialty."
                      : "Managers need to publish an active shop before it appears here. Your account is ready—you can come back at any time."
                  }
                />
                {search && (
                  <div className="text-center">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSearch("")
                      }}
                    >
                      Clear search
                    </Button>
                  </div>
                )}
              </section>
            )}
          </section>
          <aside className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-6">
            <p className="mb-5 text-[14px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Your connection
            </p>
            {selected ? (
              <>
                <ShopAvatar key={selected.id} shop={selected} photo />
                <h2 className="mt-4 font-display text-xl font-bold">
                  {selected.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.managerName}
                </p>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  {selected.description ||
                    "Discover this shop’s services and available appointments in your personalized workspace."}
                </p>
                <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
                  <MapPin size={15} className="shrink-0" />
                  {selected.location || "Location available from the manager"}
                </p>
              </>
            ) : (
              <>
                <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
                  <Store size={26} />
                </span>
                <h2 className="mt-4 font-display text-xl font-bold">
                  Find your fit.
                </h2>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Select a shop to preview your connection. Nothing is saved
                  until you confirm.
                </p>
              </>
            )}
            <div className="my-5 grid gap-3 border-y border-border py-5 text-xs text-muted-foreground">
              {[
                "A service menu made for your shop",
                "Bookings and receipts in one place",
                "Switch shops without losing your history",
              ].map((text) => (
                <p key={text} className="flex gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-primary" />
                  {text}
                </p>
              ))}
            </div>
            <Button
              icon={ArrowRight}
              className="w-full"
              disabled={!selected || status !== "connected" || saving}
              onClick={() => setConfirming(true)}
            >
              {returning ? "Review shop selection" : "Continue with this shop"}
            </Button>
            <p className="mt-3 text-center text-[14px] leading-relaxed text-muted-foreground">
              You can connect with more than one shop. Each shop keeps its own
              records.
            </p>
          </aside>
        </div>
      </main>
      {confirming && selected && (
        <Modal
          title={returning ? "Switch your shop?" : "Confirm your connection"}
          subtitle="Your selected shop becomes your business context."
          busy={saving}
          close={() => {
            if (!saving) setConfirming(false)
          }}
        >
          <div className="p-6">
            <div className="mb-4">
              <ShopAvatar shop={selected} photo />
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-secondary p-4">
              <ShopAvatar shop={selected} />
              <div>
                <p className="font-display font-bold">{selected.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Managed by {selected.managerName}
                </p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              Your dashboard will show only this shop’s services, staff,
              pricing, appointments, and receipts. Existing bookings and
              payments at other shops will remain there.
            </p>
            {!selected.active && (
              <p className="mt-3 text-xs text-amber-800">
                This shop is inactive. You can view its history, but new
                bookings are unavailable.
              </p>
            )}
            {error && (
              <div className="mt-4">
                <ErrorBox message={error} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-border p-4">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setConfirming(false)}
            >
              Go back
            </Button>
            <Button
              disabled={saving}
              icon={saving ? LoaderCircle : Check}
              onClick={() => void connect()}
            >
              {saving ? "Connecting…" : "Confirm connection"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

type ShopType = "team" | "solo"
function ShopTypeSelection({ value, change }: { value: ShopType | ""; change: (value: ShopType) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2" role="group" aria-label="Shop type">
    {([
      { value: "team", icon: Users, title: "Team-Based Shop", description: "A shared space, with a team of talented barbers.", features: ["Manage individual barber profiles", "Assign bookings and manage your team", "Customers choose their preferred barber"] },
      { value: "solo", icon: Scissors, title: "Solo-Managed Shop", description: "Your business. Your chair. One account for both.", features: ["Your own barber profile, automatically", "Bookings assigned directly to you", "Manage services, hours and customer ratings"] },
    ] as const).map((option) => <Button key={option.value} variant="secondary" aria-pressed={value === option.value} onClick={() => change(option.value)} className={cx("h-full flex-col items-start justify-start gap-3 whitespace-normal p-5 text-left", value === option.value && "border-primary bg-secondary ring-1 ring-primary")}>
      <span className="flex w-full items-center justify-between text-primary"><option.icon size={24} />{value === option.value && <CheckCircle2 size={20} />}</span>
      <span className="font-display text-lg font-bold">{option.title}</span>
      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{option.description}</span>
      <span className="grid gap-2">{option.features.map((feature) => <span key={feature} className="flex gap-2 text-xs font-normal"><Check size={14} className="shrink-0 text-primary" />{feature}</span>)}</span>
    </Button>)}
  </div>
}

function ShopSetup({ account }: { account: UserProfile }) {
  const navigate = useNavigate()
  const [shopType, setShopType] = useState<ShopType | "">("")
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: "", location: "", description: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-5">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <BrandLogo />
          <span className="font-display text-xl font-bold">SmartCut.</span>
          {account.role !== "Administrator" && <Button variant="ghost" icon={MessageSquare} className="ml-auto" onClick={() => navigate("/feedback")}>Report a problem</Button>}
        </div>
        <p className="mb-3 text-[14px] font-semibold uppercase tracking-widest text-primary">
          An independent workspace for your business
        </p>
        <PageHead
          title={step === 1 ? "How do you run your shop?" : "Let’s give your shop a home."}
          description={step === 1 ? "Choose the model that fits your business. You can change it later in Business settings, after meeting the setup requirements." : `${account.name}, create your shop’s public profile. Next, configure services and ${shopType === "solo" ? "your personal barber profile" : "your service provider team"}.`}
        />
        {step === 1 ? <div className="grid gap-5">
          <ShopTypeSelection value={shopType} change={setShopType} />
          <Button disabled={!shopType} icon={ArrowRight} onClick={() => setStep(2)}>Continue</Button>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => void signOutUser()}>Back to sign in</Button>
        </div> : <>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError("")
            try {
              await createBusinessShop({
                shopType: shopType as ShopType,
                ...form,
                name: form.name.trim(),
                location: form.location.trim(),
                description: form.description.trim(),
                serviceCategories: [],
              })
            } catch (failure) {
              setError(friendlyError(failure))
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy} className="grid gap-5">
            <Field label="Shop / business name">
              <input
                required
                minLength={2}
                maxLength={120}
                className={inputClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="The name your customers know"
              />
            </Field>
            <Field label="Location">
              <input
                required
                maxLength={300}
                className={inputClass}
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
                }
                placeholder="Street, city, province"
              />
            </Field>
            <Field
              label="A little about your shop"
              hint="Optional. Shown on your shop selection card."
            >
              <textarea
                maxLength={1000}
                rows={3}
                className={inputClass}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="What makes your space special?"
              />
            </Field>
            {error && <ErrorBox message={error} />}
            <Button type="submit" icon={busy ? LoaderCircle : Store}>
              {busy ? "Creating your shop…" : "Create my shop"}
            </Button>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1)}>Back</Button>
          </fieldset>
        </form>
        </>}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Your shop starts active and accepting customers. You can pause new
          connections in Business settings without deleting any history.
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => void signOutUser()}
        >
          Sign out
        </Button>
      </section>
    </div>
  )
}

function CustomerShopHome({
  account,
  shop,
  workspace,
  go,
  book,
}: {
  account: UserProfile
  shop: ShopProfile
  workspace: WorkspaceData
  go: (page: Page) => void
  book: () => void
}) {
  const navigate = useNavigate()
  const services = workspace.data.services || initialCollection
  const appointments = workspace.data.appointments || initialCollection
  const upcoming = appointments.records
    .filter((item) =>
      ["Pending", "Accepted", "In Progress"].includes(appointmentStatus(item.status)),
    )
    .sort((first, second) =>
      `${first.date} ${first.time}`.localeCompare(
        `${second.date} ${second.time}`,
      ),
    )
  const next = upcoming.slice(0, 3)
  const menu = services.records
    .map(serviceOf)
    .filter((item) => item.status === "Active")
    .slice(0, 4)
  const promotions = (workspace.data.promotions?.records || []).filter(
    (item) => item.active === true,
  )
  return (
    <>
      <section className="mb-6 overflow-hidden rounded-2xl border border-primary/15 bg-secondary/60 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-xl">
            <p className="mb-3 text-[14px] font-semibold uppercase tracking-[0.16em] text-primary">
              Your shop, your space
            </p>
            <h1 className="font-display text-3xl font-bold">
              Welcome back, {account.name.split(" ")[0]}.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You’re connected with{" "}
              <strong className="text-foreground">{shop.name}</strong>. Browse
              the menu, plan your next visit, and keep every receipt close.
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin size={14} />
              {shop.location || "Contact your shop for directions"}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                icon={CalendarDays}
                disabled={!shop.active}
                onClick={book}
              >
                Book a visit
              </Button>
              <Button
                variant="secondary"
                icon={ArrowUpRight}
                onClick={() => navigate("/shops")}
              >
                Switch shop
              </Button>
            </div>
          </div>
          <ShopAvatar shop={shop} large />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-primary/10 pt-4 text-xs text-muted-foreground">
          <Badge>{shop.active ? "Active" : "Inactive"}</Badge>
          <span>Managed by {shop.managerName}</span>
          <span>PHP pricing · Philippine Standard Time</span>
        </div>
      </section>
      <section aria-label="Recommended next step" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-card p-5">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Recommended next step</p>
          <h2 className="mt-2 font-display text-lg font-bold">
            {!shop.active ? "Keep track of your existing visits" : upcoming.length ? "Check your next appointment" : "Find the right service for your next visit"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {!shop.active
              ? "This shop is not taking new bookings. Your previous appointments and receipts are still here."
              : upcoming.length
                ? "Review your appointment status before making another booking. Pending visits still need the shop’s confirmation."
                : "Compare prices and service durations, then choose a provider and a time that fits your day."}
          </p>
        </div>
        <Button variant="secondary" icon={ArrowRight} onClick={() => go(!shop.active || upcoming.length ? "Appointments" : "Services")}>
          {!shop.active || upcoming.length ? "View appointments" : "Explore services"}
        </Button>
      </section>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Upcoming visits",
            value: String(upcoming.length),
            icon: CalendarDays,
            page: "Appointments" as Page,
          },
          {
            title: "Your shop’s menu",
            value: String(
              services.records.filter((item) => item.status === "Active")
                .length,
            ),
            icon: Scissors,
            page: "Services" as Page,
          },
          {
            title: "Receipts & payments",
            value: String(workspace.data.payments?.records.length || 0),
            icon: Wallet,
            page: "Payments" as Page,
          },
        ].map(({ title, value, icon: Icon, page }) => (
          <Button
            key={title}
            variant="secondary"
            onClick={() => go(page)}
            className="!flex !justify-between !p-5 text-left"
          >
            <div>
              <p className="text-xs font-normal text-muted-foreground">
                {title}
              </p>
              <p className="mt-2 font-display text-2xl font-bold">{value}</p>
            </div>
            <Icon size={22} className="text-primary" />
          </Button>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Your next visit</h2>
            <Button variant="ghost" onClick={() => go("Appointments")}>
              View all <ArrowRight size={13} />
            </Button>
          </div>
          <DataBoundary state={appointments}>
            {next.length ? (
              next.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-t border-border py-4"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {String(item.service)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(item.date)} · {formatTime12(item.time)} ·{" "}
                      {String(item.provider)}
                    </p>
                  </div>
                  <Badge>{appointmentStatus(item.status)}</Badge>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-background p-5">
                <CalendarDays size={24} className="mb-3 text-primary" />
                <p className="text-sm font-semibold">
                  A little time for yourself.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Your upcoming appointments with {shop.name} will appear here.
                </p>
                <Button
                  className="mt-4"
                  variant="secondary"
                  disabled={!shop.active}
                  onClick={book}
                >
                  Find your next service
                </Button>
              </div>
            )}
          </DataBoundary>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Explore the menu</h2>
            <Button variant="ghost" onClick={() => go("Services")}>
              All services <ArrowRight size={13} />
            </Button>
          </div>
          <DataBoundary state={services}>
            {menu.length ? (
              menu.map((service) => (
                <Button
                  key={service.id}
                  variant="ghost"
                  className="!flex w-full !justify-between border-t border-border !py-4 text-left"
                  onClick={() => go("Services")}
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {service.name}
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {service.category} · {service.durationMinutes} min
                    </span>
                  </span>
                  <span className="font-semibold text-primary">
                    {peso(service.amount)}
                  </span>
                </Button>
              ))
            ) : (
              <p className="rounded-xl bg-background p-5 text-xs leading-relaxed text-muted-foreground">
                The manager hasn’t published services yet. Your shop’s live menu
                will appear here when it’s ready.
              </p>
            )}
          </DataBoundary>
        </section>
      </div>
      {promotions.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg font-bold">
            A little extra from your shop
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {promotions.map((offer) => (
              <div
                key={offer.id}
                className="rounded-xl border border-border bg-secondary p-5"
              >
                <p className="text-sm font-semibold">{String(offer.title)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {String(offer.description)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function ConnectedWorkspace({ account, shop, bookingAccess = true, bookingAccessStatus = "connected", bookingAccessError, accessRevision = "", checkAccess }: {
  account: UserProfile; shop: ShopProfile; bookingAccess?: boolean; bookingAccessStatus?: SyncState; bookingAccessError?: string
  accessRevision?: string; checkAccess?: () => Promise<boolean>
}) {
  const workspace = useWorkspaceData(account, accessRevision, checkAccess)
  const { data, business } = workspace
  const navigate = useNavigate()
  const location = useLocation()
  const allowed = rolePages[account.role]
  const pathPage = location.pathname === "/sales" ? "Payments" : modules.find(
    (item) => `/${slug(item.page)}` === location.pathname,
  )?.page
  const page =
    pathPage || "Overview"
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [bookingAlerts, setBookingAlerts] = useState<SmartCutRecord[]>([])
  const [notificationAppointmentId, setNotificationAppointmentId] = useState("")
  const seenBookingAlerts = useRef<Set<string> | null>(null)
  const bookingReadKey = `smartcut:booking-alerts:${shop.id}:${account.uid}`
  const [localReadBookings, setLocalReadBookings] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(bookingReadKey) || "[]")
      return Array.isArray(saved) ? saved.filter((value) => typeof value === "string") : []
    } catch { return [] }
  })
  const [search, setSearch] = useState("")
  const [modal, setModal] =
    useState<"booking" | "service" | "client" | "payroll" | null>(null)
  const [editService, setEditService] = useState<Service | null>(null)
  const [editClient, setEditClient] = useState<SmartCutRecord | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState("")
  const [checkout, setCheckout] = useState<SmartCutRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const actionPending = useRef(false)
  const messageScope = `${account.uid}:${shop.id}:${location.key}`
  const [toast, setToast] = useRouteMessage(messageScope)
  const [error, setError] = useRouteMessage(messageScope)
  const searchRef = useRef<HTMLInputElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!notificationOpen) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationRef.current?.contains(event.target)) setNotificationOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationOpen(false)
        notificationRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
      }
    }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("keydown", escape)
    }
  }, [notificationOpen])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener("keydown", shortcut)
    return () => document.removeEventListener("keydown", shortcut)
  }, [])
  const go = (next: Page) => {
    navigate(`/${slug(next)}`)
    setMobileOpen(false)
    setSearch("")
    setError("")
    setToast("")
  }
  useEffect(() => {
    setNotificationOpen(false)
    setBookingAlerts([])
  }, [location.key])
  const state = (name: string) => data[name] || initialCollection
  const bookings = state("appointments").records
  const liveCheckout = checkout ? bookings.find((record) => record.id === checkout.id) : undefined
  const assignedBookings =
    account.role === "Service Provider"
      ? bookings.filter((record) => record.providerId === account.uid ||
          (record.providerId === "" && record.providerPreference === "any" && record.status === "Accepted"))
      : bookings
  const services = state("services").records.map(serviceOf)
  const providers = state("team").records.filter(
    (record) => record.active && record.role === "Service Provider" && (business.shopType !== "solo" || record.id === business.managerProviderId),
  )
  const bookingIssue =
    !bookingAccess && account.role === "Customer" && bookingAccessStatus === "connected" ? "This shop's subscription is not active. New bookings are paused until an Administrator approves access." :
    state("services").status === "error"
      ? state("services").error || "Unable to load services from Firebase."
      : state("team").status === "error"
        ? state("team").error ||
          "Unable to load Service Providers from Firebase."
        : workspace.businessStatus.status === "error"
          ? workspace.businessStatus.error ||
            "Unable to load Business Settings from Firebase."
          : workspace.businessStatus.status !== "connected"
            ? "Loading this shop’s booking settings. Please wait for the connection to finish."
          : business.bookingSchemaVersion !== 2
            ? isManager(account.role)
              ? "Finish booking setup in Settings → Business: confirm this shop’s opening hours and save. Any active legacy appointments must be reviewed first."
              : "This shop’s booking setup is not ready yet. Please ask its Manager to confirm and save the opening hours in Business Settings."
            : ""
  const storedNotifications = state("notifications").records
  const notifications = useMemo(() => {
    if (account.role === "Service Provider") {
      const accepted = bookings.filter((record) =>
        record.providerId === account.uid &&
        (record.status === "Accepted" || !!record.acceptedAt),
      ).map((record) => ({
        id: `local-accepted:${record.id}`, localBooking: true,
        type: "appointment-accepted", appointmentId: record.id,
        title: "Appointment accepted", customerName: bookingClient(record),
        service: record.service, date: record.date, time: record.time,
        message: `The manager accepted ${bookingClient(record)}'s appointment for ${record.service} on ${record.date} at ${formatTime12(record.time)}. You are the assigned service provider.`,
        read: localReadBookings.includes(`accepted:${record.id}`),
        createdAt: record.acceptedAt || record.updatedAt,
      }))
      return [...storedNotifications, ...accepted]
    }
    if (account.role !== "Manager") return storedNotifications
    const delivered = new Set(storedNotifications.filter((record) => record.type === "appointment-booked").map((record) => record.appointmentId))
    const fallback = bookings.filter((record) => record.customerId && record.createdBy === record.customerId && record.status === "Pending" && !delivered.has(record.id)).map((record) => ({
      id: `local-booking:${record.id}`, localBooking: true,
      type: "appointment-booked", appointmentId: record.id,
      title: "New appointment request", customerName: bookingClient(record),
      service: record.service, date: record.date, time: record.time, provider: record.provider,
      message: `${bookingClient(record)} requested ${record.service} on ${record.date} at ${formatTime12(record.time)}. Review this booking in Appointments.`,
      read: localReadBookings.includes(record.id), createdAt: record.createdAt,
    }))
    return [...storedNotifications.map((record) => record.type === "appointment-booked" && localReadBookings.includes(String(record.appointmentId)) ? { ...record, read: true } : record), ...fallback]
  }, [account.role, account.uid, storedNotifications, bookings, localReadBookings])
  const readNotifications = async (records: SmartCutRecord[]) => {
    const persisted = records.filter((record) => !record.localBooking)
    if (persisted.length) await markNotificationsRead(persisted)
    const ids = records.filter((record) => record.type === "appointment-booked" || record.type === "appointment-accepted").map((record) =>
      record.type === "appointment-accepted" ? `accepted:${record.appointmentId}` : String(record.appointmentId),
    )
    setLocalReadBookings((current) => {
      const next = [...new Set([...current, ...ids])]
      try { localStorage.setItem(bookingReadKey, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const unread = notifications.filter((record) => !record.read)
  const feedbackCount = account.role === "Administrator" ? state("feedback").records.filter((record) => record.status === "New").length : 0
  const notificationCount = unread.length + feedbackCount
  useEffect(() => {
    if (!["Manager", "Service Provider"].includes(account.role) ||
      data.appointments?.status !== "connected" || data.notifications?.status !== "connected") return
    const bookings = notifications.filter((record) => record.type === (account.role === "Manager" ? "appointment-booked" : "appointment-accepted"))
    if (!seenBookingAlerts.current) {
      // Initial unread history stays in the inbox, not a replayed popup.
      seenBookingAlerts.current = new Set(bookings.map((record) => String(record.appointmentId)))
      return
    }
    const fresh = bookings.filter((record) => !seenBookingAlerts.current!.has(String(record.appointmentId)) && !record.read)
    bookings.forEach((record) => seenBookingAlerts.current!.add(String(record.appointmentId)))
    if (fresh.length) setBookingAlerts((current) => [...current, ...fresh])
  }, [account.role, notifications, data.appointments?.status, data.notifications?.status])
  if (!pathPage || !allowed.includes(page))
    return (
      <Navigate
        to="/overview"
        replace
      />
    )
  const statuses = [
    ...Object.values(data),
    workspace.businessStatus,
    ...(isManager(account.role) ? [workspace.usersStatus] : []),
  ]
  const connected =
    statuses.length > 0 && statuses.every((item) => item.status === "connected")
  const syncError = statuses.some((item) => item.status === "error")
  const run: Action = async (operation, message) => {
    if (busy || actionPending.current) return
    actionPending.current = true
    setBusy(true)
    setError("")
    try {
      await operation()
      setToast(message)
    } catch (failure) {
      setError(friendlyError(failure))
    } finally {
      actionPending.current = false
      setBusy(false)
    }
  }
  const openService = (service: Service | null) => {
    setEditService(service)
    setModal("service")
  }
  const canBook = account.role !== "Service Provider" && shop.active && bookingAccess
  const navItems = modules.filter((item) => allowed.includes(item.page))
  return (
    <div data-shop-theme={shop.themeColor || "forest"} className={cx("min-h-dvh transition-[padding] duration-200 motion-reduce:transition-none", !sidebarCollapsed && "lg:pl-[224px]")}>
      {bookingAlerts[0] && (
        <section aria-label="New appointment notification" role="status" className="fixed bottom-5 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-primary/25 bg-card p-5 shadow-lg sm:right-6">
          <div className="flex items-center gap-3"><span className="rounded-lg bg-secondary p-2 text-primary"><Bell size={19} /></span><div><p className="text-sm font-semibold">{bookingAlerts[0].type === "appointment-accepted" ? "Appointment accepted" : "New appointment request"}</p><p className="text-xs text-muted-foreground">{bookingAlerts[0].type === "appointment-accepted" ? "The manager approved your assigned appointment" : "Waiting for your approval"}</p></div></div>
          <p className="mt-4 text-sm font-semibold">{String(bookingAlerts[0].customerName)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{String(bookingAlerts[0].service)}</p>
          <p className="mt-2 text-xs text-muted-foreground">{String(bookingAlerts[0].date)} · {formatTime12(bookingAlerts[0].time)} · Asia/Manila</p>
          {!!bookingAlerts[0].provider && <p className="mt-1 text-xs text-muted-foreground">Barber: {String(bookingAlerts[0].provider)}</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={() => { const alert = notifications.find((record) => record.appointmentId === bookingAlerts[0].appointmentId) || bookingAlerts[0]; setNotificationAppointmentId(String(alert.appointmentId)); go("Appointments"); void run(() => readNotifications([alert]), "Appointment opened."); setBookingAlerts((current) => current.slice(1)) }}>View Appointment</Button>
            <Button variant="ghost" onClick={() => {
              if (bookingAlerts[0].type === "appointment-accepted")
                void run(() => readNotifications([bookingAlerts[0]]), "Notification dismissed.")
              setBookingAlerts((current) => current.slice(1))
            }}>Dismiss</Button>
          </div>
        </section>
      )}
      {notificationAppointmentId && state("appointments").records.find((record) => record.id === notificationAppointmentId) && (
        <AppointmentDetails key={notificationAppointmentId} record={state("appointments").records.find((record) => record.id === notificationAppointmentId)!} role={account.role} reviews={state("reviews")} startRating={false} allowManagerDecision busy={busy} run={run} close={() => setNotificationAppointmentId("")} />
      )}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="workspace-sidebar"
        aria-label="Workspace navigation"
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[224px] flex-col overflow-hidden border-r border-white/5 bg-sidebar text-sidebar-foreground transition-transform",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarCollapsed && "lg:hidden",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
          <BrandLogo />
          <div>
            <div className="font-display text-lg font-bold">
              SmartCut<span className="text-emerald-200">.</span>
            </div>
          </div>
          <button
            aria-label="Close navigation"
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav
          aria-label="Workspace modules"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map(({ page: item, icon: Icon, group }, index) => (
            <div key={item}>
              {group && (
                <p
                  className={cx(
                    "mb-1 px-3 text-[14px] font-semibold tracking-[0.14em] text-white/45",
                    index === 0 ? "mt-1" : "mt-3 border-t border-white/5 pt-2",
                  )}
                >
                  {group}
                </p>
              )}
              {!(business.shopType === "solo" && (item === "Team" || item === "Payroll")) && <button
                aria-current={page === item ? "page" : undefined}
                onClick={() => go(item)}
                className={cx(
                  "mb-0.5 flex min-h-8 w-full items-center gap-2.5 rounded-lg border border-transparent px-3 text-xs transition-colors focus-visible:ring-inset",
                  page === item
                    ? "border-emerald-200/20 bg-white/10 font-semibold text-emerald-100"
                    : "text-white/65 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{pageLabel(item, account.role)}</span>
                {item === "Appointments" &&
                  assignedBookings.filter(
                    (record) => record.status === "Pending",
                  ).length > 0 && (
                    <span className="ml-auto shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[14px] tabular-nums">
                      {
                        assignedBookings.filter(
                          (record) => record.status === "Pending",
                        ).length
                      }
                    </span>
                  )}
              </button>}
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-200/15 text-xs font-bold text-emerald-100">
              {initials(account.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{account.name}</p>
              <p className="truncate text-[14px] text-white/50">
                {account.role}
              </p>
            </div>
            <button
              disabled={busy}
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void run(signOutUser, "Signed out.")}
              className="shrink-0 rounded-md p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex min-h-[66px] items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            aria-label="Toggle navigation sidebar"
            title="Expand or collapse sidebar"
            aria-expanded={window.matchMedia("(min-width: 1024px)").matches ? !sidebarCollapsed : mobileOpen}
            aria-controls="workspace-sidebar"
            className="bg-sidebar text-sidebar-foreground! hover:bg-sidebar/90! hover:text-sidebar-foreground!"
            onClick={() => {
              if (window.matchMedia("(min-width: 1024px)").matches)
                setSidebarCollapsed((collapsed) => !collapsed)
              else
                setMobileOpen((open) => !open)
            }}
          >
            <span className="lg:hidden" aria-hidden="true">{mobileOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</span>
            <span className="hidden lg:inline-flex" aria-hidden="true">{sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</span>
          </Button>
          <Button
            variant="ghost"
            icon={Menu}
            aria-label="Open navigation"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          />
          <BrandLogo className="lg:hidden" />
          <div>
            <p className="text-sm font-semibold">
              {account.role === "Customer" ? shop.name : page === "Overview"
                ? `Good ${
                    new Date().getHours() < 12 ? "morning" : "day"
                  }, ${account.name.split(" ")[0]}`
                : pageLabel(page, account.role)}
            </p>
            <WorkspaceClock />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative hidden md:block">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search size={14} className="text-muted-foreground" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a module…"
                aria-label="Find a module"
                className="w-32 bg-transparent text-xs outline-none"
              />
              <kbd className="rounded border border-border px-1 text-[14px] text-muted-foreground">
                ⌘ K
              </kbd>
            </label>
            {search && (
              <div className="absolute top-full mt-2 w-full rounded-xl border border-border bg-card p-1 shadow-lg">
                {navItems
                  .filter((item) =>
                    pageLabel(item.page, account.role).toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      key={item.page}
                      className="block w-full rounded-md p-2 text-left text-xs hover:bg-muted"
                      onClick={() => go(item.page)}
                    >
                      {pageLabel(item.page, account.role)}
                    </button>
                  ))}
                {!navItems.some((item) =>
                  pageLabel(item.page, account.role).toLowerCase().includes(search.toLowerCase()),
                ) && (
                  <p className="p-2 text-xs text-muted-foreground">
                    No matching modules.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={notificationRef}>
            <NotificationBell count={notificationCount} open={notificationOpen} toggle={() => setNotificationOpen(!notificationOpen)} />
            {notificationOpen && <NotificationPanel
              state={state("notifications")} role={account.role} unread={unread.length} busy={busy}
              records={notifications.map((record) => ({ ...record, time: record.time || bookings.find((booking) => booking.id === record.appointmentId)?.time }))}
              feedbackCount={feedbackCount} openFeedback={() => { setNotificationOpen(false); go("Feedback") }}
              close={() => setNotificationOpen(false)}
              markAll={() => void run(() => readNotifications(unread), "Notifications marked as read.")}
              select={(record) => {
                if (record.appointmentId && bookings.some((booking) => booking.id === record.appointmentId)) {
                  setNotificationAppointmentId(String(record.appointmentId))
                  setNotificationOpen(false)
                  setBookingAlerts((current) => current.filter((alert) => alert.appointmentId !== record.appointmentId))
                  go("Appointments")
                }
                if (!record.read) void run(() => readNotifications([record]), "Notification marked as read.")
              }}
            />}
          </div>
          {account.role === "Customer" && (
            <Button icon={Plus} onClick={() => setModal("booking")}>
              <span className="hidden sm:inline">
                {account.role === "Customer"
                  ? "Book appointment"
                  : "New appointment"}
              </span>
              <span className="sm:hidden">Book</span>
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-5 pb-24 sm:px-6 lg:pb-6">
        {account.role === "Manager" && business.onboardingComplete === false && <div className="mb-5 grid gap-3 rounded-xl border border-primary/20 bg-secondary p-5">
          <PageHead title="Make your shop booking-ready." description={business.shopType === "solo" ? "Add your services and prices, then configure your barber profile and working hours. No employee accounts needed." : "Add your services and prices, then publish your service provider team. You can also work as a barber."} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => go("Services")}>{services.some((service) => service.status === "Active") ? "Review services" : "Configure services"}</Button>
            <Button variant="secondary" onClick={() => go(business.shopType === "solo" ? "Settings" : "Team")}>{business.shopType === "solo" ? "Configure my barber profile" : "Set up service providers"}</Button>
            <Button variant="secondary" onClick={() => go("Settings")}>Review working hours</Button>
            <Button disabled={busy || !providers.length || !services.some((service) => service.status === "Active")} onClick={() => void run(() => updateRecord("settings", "business", { onboardingComplete: true }), "Shop setup completed.")}>Finish setup</Button>
          </div>
        </div>}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><Store size={18} className="shrink-0 text-primary" /><div><p className="text-xs font-semibold">{shop.name}</p><p className="mt-1 text-[14px] text-muted-foreground">{shop.location || "Your independent business workspace"} · {shop.active ? "Active" : "Inactive"}</p></div></div>
          {(account.role === "Customer" || account.role === "Administrator") && <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate("/shops")}>{account.role === "Administrator" ? "Manage another shop" : "Switch shop"}</Button>}
        </div>
        {syncError && <div className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4">
          <ErrorBox message={statuses.find((item) => item.status === "error")?.error || "Some live data could not be loaded. Check your connection and reconnect."} />
          <Button variant="secondary" disabled={busy} onClick={workspace.reconnect}>Reconnect live data</Button>
        </div>}
        {account.role === "Customer" && bookingAccessStatus === "connecting" && <span role="status" className="mb-4 block text-sm text-muted-foreground">Checking this shop's booking availability…</span>}
        {account.role === "Customer" && bookingAccessStatus === "error" && <ErrorBox message={bookingAccessError || "This shop's booking availability could not be confirmed. Please reconnect."} />}
        {!bookingAccess && account.role === "Customer" && bookingAccessStatus === "connected" && <ErrorBox message="New bookings are paused while this shop's subscription or access requirements are reviewed. Your existing appointments and receipts remain available." />}
        {!shop.active && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">This shop is inactive. Existing appointments, payments, and history remain available. New bookings are paused.</div>}
        {isManager(account.role) && workspace.businessStatus.status === "connected" && business.bookingSchemaVersion !== 2 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-secondary p-4">
            <div><p className="text-sm font-semibold text-primary">Finish this shop’s booking setup</p><p className="mt-1 text-xs text-muted-foreground">Confirm opening hours in Business Settings to enable reservations. Existing appointments stay unchanged.</p></div>
            <Button variant="secondary" onClick={() => go("Settings")}>Review booking setup</Button>
          </div>
        )}
        {error && (
          <div className="mb-4">
            <ErrorBox message={error} />
            <button
              className="mt-1 text-xs text-muted-foreground hover:underline"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        )}
        {page === "Overview" && (
          account.role === "Customer"
            ? <CustomerShopHome account={account} shop={shop} workspace={workspace} go={go} book={() => { if (bookingAccess) setModal("booking"); else setError("This shop's subscription is not active. Please contact the shop.") }} />
            : <Overview account={account} workspace={workspace} go={go}
                openPayments={() => navigate("/appointments?filter=payment")} />
        )}
        {page === "Appointments" && (
          <Appointments
            key={location.search}
            state={{ ...state("appointments"), records: assignedBookings }}
            role={account.role}
            canEditRecords={account.role === "Administrator" || (account.role === "Manager" && shop.ownerId === account.uid)}
            providerUid={account.uid}
            reviews={state("reviews")}
            busy={busy}
            run={run}
            onCheckout={setCheckout}
            onBook={() => setModal("booking")}
            providers={providers}
            initialFilter={(isManager(account.role) || account.role === "Service Provider") && new URLSearchParams(location.search).get("filter") === "payment" ? "Record payment" : "All statuses"}
          />
        )}
        {page === "Services" && (
          <Services
            state={state("services")}
            services={services}
            role={account.role}
            manage={isManager(account.role)}
            canCreate={
              isManager(account.role) || account.role === "Service Provider"
            }
            edit={openService}
            book={(id) => {
              if (!bookingAccess) { setError("New bookings are paused while this shop's subscription is reviewed."); return }
              setSelectedServiceId(id)
              setModal("booking")
            }}
            canBook={canBook}
          />
        )}
        {page === "Customers" && (
          <Customers
            state={state("clients")}
            appointments={state("appointments")}
            account={account}
            canEditRecords={account.role === "Administrator" || (account.role === "Manager" && shop.ownerId === account.uid)}
            canEdit={
              isManager(account.role) || account.role === "Service Provider"
            }
            edit={(record) => {
              setEditClient(record)
              setModal("client")
            }}
            run={run}
          />
        )}
        {page === "Team" && (
          business.shopType === "solo" ? <div className="rounded-xl border border-border bg-card p-5"><PageHead title="Your personal barber profile" description="You run a solo shop. Your manager account is also your barber profile—no employee account is needed. Switch to a team-based shop in Business settings before adding providers." /><Button onClick={() => go("Settings")}>Manage my barber profile</Button></div> :
          <Team
            users={workspace.users}
            state={workspace.usersStatus}
            providers={providers}
            account={account}
            busy={busy}
            run={run}
            created={(message) =>
              setToast(
                message || "Team account created. The new member can sign in with their email and password.",
              )
            }
          />
        )}
        {page === "Payments" && (
          <Finance
            page={page}
            state={isManager(account.role) ? combinedFinance(state("sales"), state("payments")) : state("payments")}
            appointments={bookings}
            appointmentsStatus={state("appointments").status}
            canCheckout={isManager(account.role)}
            checkout={setCheckout}
            admin={account.role === "Administrator"}
            canEditRecords={account.role === "Administrator" || (account.role === "Manager" && shop.ownerId === account.uid)}
            run={run}
          />
        )}
        {page === "Analytics" && (
          <Analytics sales={state("sales")} bookings={state("appointments")} />
        )}
        {page === "Ratings & Reviews" && (
          <RatingsAndReviews account={account} workspace={workspace} />
        )}
        {page === "Payroll" && (
          <Payroll
            state={state("payroll")}
            finance={combinedFinance(state("sales"), state("payments"))}
            providers={providers}
            role={account.role}
            add={() => setModal("payroll")}
          />
        )}
        {page === "Subscription" && (
          <Subscription
            account={account}
            business={workspace.business}
            state={state("subscription")}
            businessStatus={workspace.businessStatus}
            reconnect={workspace.reconnect}
            payments={state("subscriptionPayments")}
            requests={state("subscriptionPaymentRequests")}
            events={state("subscriptionEvents")}
          />
        )}
        {page === "Settings" && (
          <Settings
            account={account}
            shop={shop}
            workspace={workspace}
            run={run}
            busy={busy}
          />
        )}
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {navItems.slice(0, 4).map(({ page: item, icon: Icon }) => (
          <button
            aria-current={page === item ? "page" : undefined}
            key={item}
            onClick={() => go(item)}
            className={cx(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[14px]",
              page === item ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon size={18} />
            {item}
          </button>
        ))}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex min-h-14 flex-col items-center justify-center gap-1 text-[14px] text-muted-foreground"
        >
          <Menu size={18} />
          More
        </button>
      </nav>
      {modal === "booking" && (
        <ServiceVisitModal
          selectedServiceId={selectedServiceId}
          account={account}
          services={services}
          providers={providers}
          clients={state("clients").records}
          bookingIssue={bookingIssue}
          setup={isManager(account.role) ? () => { setModal(null); go("Settings") } : undefined}
          business={business}
          close={() => {
            setModal(null)
            setSelectedServiceId("")
          }}
          saved={() => setToast("Your appointment request has been submitted and is waiting for manager approval.")}
          walkInSaved={() => setToast("Walk-in completed. Payment recorded in Sales and Payments.")}
        />
      )}
      {page === "Services" && isManager(account.role) && (
        <LegacyCatalog
          state={state("catalog")}
          serviceRecords={state("services").records}
          edit={openService}
        />
      )}
      {modal === "service" && (
        <ServiceModal
          service={editService}
          services={services}
          close={() => setModal(null)}
          saved={() =>
            setToast("Service saved. Catalog and booking menu updated.")
          }
        />
      )}
      {modal === "client" && (
        <CustomerModal
          customer={editClient}
          close={() => setModal(null)}
          saved={() => setToast("Customer record saved to Firebase.")}
        />
      )}
      {modal === "payroll" && (
        <PayrollModal
          providers={providers}
          existing={state("payroll").records}
          close={() => setModal(null)}
          saved={() =>
            setToast(
              "Payroll statement recorded. No funds have been transferred.",
            )
          }
        />
      )}
      {liveCheckout && (isManager(account.role) || (account.role === "Service Provider" && liveCheckout.providerId === account.uid)) && (
        <CheckoutModal
          key={liveCheckout.id}
          appointment={liveCheckout}
          confirmed={state("appointments").status === "connected"}
          statusOnly={account.role === "Service Provider"}
          close={() => setCheckout(null)}
          saved={() =>
            setToast(
              account.role === "Service Provider" ? "Paid." : "Payment and sale saved together. Receipt is available in Payments.",
            )
          }
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 right-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-xl lg:bottom-5"
        >
          <CheckCircle2 size={19} className="shrink-0 text-emerald-600" />
          <div>
            <p className="text-xs font-semibold">Saved successfully</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {toast}
            </p>
          </div>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

function NotificationPanel({ state, records, unread, busy, role, close, markAll, select, feedbackCount, openFeedback }: {
  state: CollectionState; records: SmartCutRecord[]; unread: number; busy: boolean; role: UserRole
  close: () => void; markAll: () => void; select: (record: SmartCutRecord) => void
  feedbackCount: number; openFeedback: () => void
}) {
  return <section id="notification-panel" aria-label="Notifications" className="fixed inset-x-3 top-20 z-30 overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96">
    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-secondary p-2 text-primary"><Bell size={19} /></span>
        <div><span className="block font-display text-base font-bold">Notifications</span><span className="text-xs text-muted-foreground">{unread} unread · Philippine time</span></div>
      </div>
      <Button variant="ghost" icon={X} aria-label="Close notifications" onClick={close} />
    </div>
    {feedbackCount > 0 && <div className="border-b border-border bg-secondary/40 p-4">
      <span className="block text-sm font-semibold">{feedbackCount} feedback {feedbackCount === 1 ? "report needs" : "reports need"} review</span>
      <Button variant="ghost" icon={MessageSquare} className="mt-2" onClick={openFeedback}>Open feedback inbox</Button>
    </div>}
    <DataBoundary state={state}>
      {unread > 0 && <div className="flex justify-end border-b border-border px-3 py-2"><Button disabled={busy || state.status !== "connected"} variant="ghost" onClick={markAll}>Mark all read</Button></div>}
      <div className="max-h-96 overflow-y-auto">
        {records.length ? [...records].sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)).map((record) => {
          const message = role === "Service Provider" && record.title === "Payment recorded" ? "Paid."
            : formatNotificationTime(record.title === "Payment recorded"
              ? String(record.message).replace(/ via (?:Cash|GCash|Card|Bank transfer)\.?$/i, ".")
              : String(record.message), record.time)
          return <Button key={record.id} variant="ghost" disabled={busy || state.status !== "connected"}
            aria-label={`${String(record.title)}. ${record.read ? "Read" : "Unread"}`}
            onClick={() => select(record)}
            className={cx("w-full items-start justify-start gap-3 rounded-none border-b border-border p-4 text-left font-normal last:border-0", !record.read && "bg-secondary/30")}>
            <span aria-hidden="true" className={cx("mt-2 size-2 shrink-0 rounded-full", record.read ? "bg-muted" : "bg-primary")} />
            <span className="grid min-w-0 gap-2 whitespace-normal">
              <span className="break-words text-sm font-semibold text-foreground">{String(record.title)}</span>
              <span className="break-words text-sm leading-relaxed text-muted-foreground">{message}</span>
              <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Clock3 size={12} />{formatTimestampManila(record.createdAt, "Awaiting timestamp")} · {record.read ? "Read" : "Unread"}</span>
            </span>
          </Button>
        }) : <Empty icon={Bell} title="You're all caught up" description="Booking and payment updates will appear here." />}
      </div>
    </DataBoundary>
  </section>
}

function Overview({
  account,
  workspace,
  go,
  openPayments,
}: {
  account: UserProfile
  workspace: WorkspaceData
  go: (page: Page) => void
  openPayments?: () => void
}) {
  const bookingsState = workspace.data.appointments || initialCollection
  const bookings =
    account.role === "Service Provider"
      ? bookingsState.records.filter(
          (record) => record.providerId === account.uid && !["Pending", "Rejected", "Cancelled"].includes(appointmentStatus(record.status)),
        )
      : bookingsState.records
  const sales = workspace.data.sales || initialCollection
  const today = manilaDate()
  const todayBookings = bookings.filter((record) => record.date === today)
  const todaySales = sales.records.filter(
    (record) => recordDate(record) === today,
  )
  const upcoming = [...bookings]
    .filter(
      (record) =>
        !["Completed", "Rated", "Rejected", "Cancelled"].includes(appointmentStatus(record.status)) &&
        String(record.date) >= today,
    )
    .sort((first, second) =>
      `${first.date} ${first.time}`.localeCompare(
        `${second.date} ${second.time}`,
      ),
    )
    .slice(0, 7)
  const provider = account.role === "Service Provider"
  return (
    <>
      <PageHead
        title={provider ? "Your service desk." : "A clear view of your day."}
        description={`${String(workspace.business.name || "Your workspace")} · Philippine Standard Time`}
      >
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          {today}
        </span>
      </PageHead>
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label={provider ? "Assigned today" : "Collected today"}
          value={
            provider
              ? String(todayBookings.length)
              : sales.status === "connected"
                ? peso(
                    todaySales.reduce(
                      (sum, record) => sum + amountOf(record),
                      0,
                    ),
                  )
                : "—"
          }
          note={
            provider
              ? "Only your assigned appointments"
              : "Recorded payments, not booking estimates"
          }
          icon={provider ? CalendarDays : Wallet}
        />
        <Metric
          label="Appointments today"
          value={
            bookingsState.status === "connected"
              ? String(todayBookings.length)
              : "—"
          }
          note="All statuses · live booking records"
          icon={CalendarDays}
        />
        <Metric
          label={provider ? "Awaiting service" : "Awaiting confirmation"}
          value={
            bookingsState.status === "connected"
              ? String(
                  bookings.filter((record) => appointmentStatus(record.status) === (provider ? "Accepted" : "Pending"))
                    .length,
                )
              : "—"
          }
          note={provider ? "Accepted bookings assigned to you" : "Pending appointment requests"}
          icon={Clock3}
        />
        <Metric
          label="Completed today"
          value={
            bookingsState.status === "connected"
              ? String(
                  todayBookings.filter(
                    (record) => ["Completed", "Rated"].includes(String(record.status)),
                  ).length,
                )
              : "—"
          }
          note={provider ? "Your finished services" : "Finished services, paid or unpaid"}
          icon={CheckCircle2}
        />
      </div>
      {(isManager(account.role) || provider) && (
        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          {[
            {
              title: provider ? "My appointments" : "Manage appointments",
              detail: provider ? "View your assigned schedule" : "Review requests and schedules",
              next: "Appointments" as Page,
              icon: CalendarDays,
            },
            {
              title: "Record a payment",
              detail: provider ? "Mark your completed services Paid" : "Checkout completed services",
              next: (provider ? "Appointments" : "Payments") as Page,
              icon: CreditCard,
            },
            {
              title: provider ? "My payroll statements" : "Manage payroll",
              detail: provider ? "View your recorded statements" : "Review earnings and statements",
              next: "Payroll" as Page,
              icon: Wallet,
            },
          ].map(({ title, detail, next, icon: Icon }) => (
            <Button
              variant="secondary"
              key={title}
              onClick={() => provider && title === "Record a payment" ? (openPayments ? openPayments() : go("Appointments")) : go(next)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/35 hover:bg-secondary/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {detail}
                </span>
              </span>
              <ArrowRight
                size={14}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </Button>
          ))}
        </div>
      )}
      <div className="grid items-start gap-4">
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Next in your schedule</h2>
                <p className="mt-0.5 text-[14px] text-muted-foreground">
                  Upcoming bookings · ordered by date and time
                </p>
              </div>
              <Button
                variant="ghost"
                icon={ArrowRight}
                onClick={() => go("Appointments")}
              >
                View all
              </Button>
            </div>
            <DataBoundary state={bookingsState}>
              {upcoming.length ? (
                upcoming.map((record) => (
                  <BookingLine key={record.id} record={record} showAmount={isManager(account.role)} />
                ))
              ) : (
                <Empty
                  title="Room for your next booking"
                  description={
                    provider
                      ? "Your assigned appointments will appear here."
                      : "Create an appointment to start building your studio’s day."
                  }
                  action={
                    !provider && (
                      <Button
                        icon={ArrowRight}
                        onClick={() => go("Appointments")}
                      >
                        Open appointments
                      </Button>
                    )
                  }
                />
              )}
            </DataBoundary>
          </section>
          {isManager(account.role) && <RevenuePanel state={sales} />}
        </div>
      </div>
      <div className="mt-5">
        <RatingsAndReviews account={account} workspace={workspace} compact open={() => go("Ratings & Reviews")} />
      </div>
    </>
  )
}
function BookingLine({
  record,
  highlighted = false,
  showAmount = true,
}: {
  record: SmartCutRecord
  highlighted?: boolean
  showAmount?: boolean
}) {
  if (highlighted) {
    const date = new Date(`${String(record.date)}T12:00:00+08:00`)
    const dateLabel = Number.isFinite(date.getTime())
      ? date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
      : String(record.date || "Date not recorded")
    return (
      <div className="grid gap-4 border-b border-border pb-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="flex items-center gap-3 sm:block">
          <div className="w-28 shrink-0 rounded-xl border border-primary/15 bg-secondary px-3 py-3 text-center text-primary">
            <span className="flex items-center justify-center gap-1.5 text-xl font-bold tabular-nums"><Clock3 size={15} />{formatTime12(record.time)}</span>
            <span className="mt-1 block truncate text-xs tabular-nums">{dateLabel}</span>
          </div>
          <span className="text-xs font-medium text-muted-foreground sm:mt-2 sm:block sm:text-center">Asia/Manila</span>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2"><VisitTypeBadge type="Booking" /><span className="text-xs text-muted-foreground">#{record.id.slice(-6)}</span></div>
          <span className="block break-words font-display text-base font-bold">{bookingClient(record)}</span>
          <span className="mt-1 block break-words text-sm font-medium">{String(record.service || "Service not recorded")}</span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Scissors size={13} className="shrink-0" />Provider: {String(record.provider || "Not assigned")}</span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <Badge>{appointmentStatus(record.status)}</Badge>
          {showAmount && <span className="text-lg font-bold tabular-nums">{peso(bookingAmount(record))}</span>}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 last:border-0">
      <div className="w-32 shrink-0">
        <p className="text-xs font-semibold tabular-nums">
          {formatTime12(record.time)}
        </p>
        <p className="mt-1 text-[14px] tabular-nums text-muted-foreground">
          {formatDateManila(record.date)}
        </p>
      </div>
      <span className="h-8 w-0.5 rounded-full bg-primary/60" />
      <div className="min-w-48 flex-1">
        <p className="text-xs font-semibold">
          {bookingClient(record)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span>
            {String(record.service)}
          </span>{" "}
          · {String(record.provider)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge>{appointmentStatus(record.status)}</Badge>
        {showAmount && <span className="text-xs font-semibold tabular-nums">
          {peso(bookingAmount(record))}
        </span>}
      </div>
    </div>
  )
}
function RevenuePanel({ state }: { state: CollectionState }) {
  const days = Array.from({ length: 7 }, (_, index) =>
    manilaDate(new Date(Date.now() - (6 - index) * 86400000)),
  )
  const totals = days.map((day) =>
    state.records
      .filter((record) => recordDate(record) === day)
      .reduce((sum, record) => sum + amountOf(record), 0),
  )
  const max = Math.max(...totals, 1)
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Revenue rhythm</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Recorded sales · last 7 days
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {state.status === "connected"
            ? peso(totals.reduce((sum, value) => sum + value, 0))
            : "—"}
        </span>
      </div>
      <DataBoundary state={state}>
        {totals.some((value) => value > 0) ? (
          <div
            className="grid grid-cols-7 items-end gap-2"
            role="img"
            aria-label={days
              .map((day, index) => `${day}: ${peso(totals[index])}`)
              .join("; ")}
          >
            {days.map((day, index) => (
              <div key={day} className="text-center">
                <p className="mb-2 truncate text-[14px] tabular-nums text-muted-foreground">
                  {peso(totals[index])}
                </p>
                <div className="flex h-28 items-end justify-center rounded-md bg-background">
                  <div
                    className="w-3/4 rounded-t-md bg-primary/75"
                    style={{
                      height: `${Math.max((totals[index] / max) * 100, 2)}%`,
                    }}
                  />
                </div>
                <span className="mt-2 block text-[14px] text-muted-foreground">
                  {new Date(`${day}T12:00:00+08:00`).toLocaleDateString(
                    "en-PH",
                    { weekday: "short", timeZone: "Asia/Manila" },
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={TrendingUp}
            title="No revenue recorded this week"
            description="Paid appointments create real sales records. Booking prices are not counted as revenue."
          />
        )}
      </DataBoundary>
    </section>
  )
}

const emptyReviewFilters: ReviewFilters = {
  search: "",
  providerId: "",
  serviceId: "",
  rating: "",
  scoreType: "service",
  dateType: "rating",
  start: "",
  end: "",
}
function RatingsAndReviews({ account, workspace, compact = false, open }: {
  account: UserProfile
  workspace: WorkspaceData
  compact?: boolean
  open?: () => void
}) {
  const provider = account.role === "Service Provider"
  const manager = isManager(account.role)
  const [filters, setFilters] = useState<ReviewFilters>({ ...emptyReviewFilters, scoreType: provider ? "provider" : "service" })
  const reviews = workspace.data.reviews || initialCollection
  const appointments = workspace.data.appointments || initialCollection
  const entries = useMemo(() => completedReviewEntries(reviews.records, appointments.records, account.role, account.uid), [reviews.records, appointments.records, account.role, account.uid])
  const filtered = compact ? entries : filterReviewEntries(entries, filters)
  const ready = reviews.status === "connected" && appointments.status === "connected"
  const failed = reviews.status === "error" || appointments.status === "error"
  const state: CollectionState = {
    records: ready ? reviews.records : [],
    status: failed ? "error" : ready ? "connected" : "connecting",
    error: reviews.error || appointments.error,
  }
  const serviceScores = filtered.map((entry) => entry.serviceRating)
  const providerScores = filtered.flatMap((entry) => entry.providerRating === undefined ? [] : [entry.providerRating])
  const average = (scores: number[]) => scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : null
  const serviceAverage = average(serviceScores)
  const providerAverage = average(providerScores)
  const distribution = (provider || filters.scoreType === "provider") ? providerScores : serviceScores
  const currentBarbers: [string, string][] = (workspace.data.team?.records || []).filter((record) => record.role === "Service Provider").map((record) => [record.id, String(record.name || "Service provider")])
  const currentServices: [string, string][] = (workspace.data.services?.records || []).filter((record) => typeof record.name === "string").map((record) => [record.id, String(record.name)])
  const barbers = [...new Map<string, string>([...currentBarbers, ...entries.map((entry): [string, string] => [entry.providerId, entry.provider])]).entries()].sort((first, second) => first[1].localeCompare(second[1]))
  const services = [...new Map<string, string>([...currentServices, ...entries.map((entry): [string, string] => [entry.serviceId, entry.service])]).entries()].sort((first, second) => first[1].localeCompare(second[1]))
  const updateFilter = <Key extends keyof ReviewFilters>(key: Key, value: ReviewFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }))
  const hasFilters = Boolean(filters.search || filters.providerId || filters.serviceId || filters.rating || filters.start || filters.end)
  const invalidRange = Boolean(filters.start && filters.end && filters.start > filters.end)
  const formatDate = (date: string) => date ? new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }) : "Not recorded"
  const scoreSummary = (label: string, score: number | null, count: number) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 flex items-center justify-between text-xs text-muted-foreground">{label}<Star size={16} className="text-primary" /></p>
      {ready && score !== null ? <AppointmentStars value={score} label={label} /> : <p className="font-display text-2xl font-bold">—</p>}
      <p className="mt-3 text-[14px] text-muted-foreground">{ready ? `${count} ${count === 1 ? "rating" : "ratings"}` : "Loading ratings…"} · Kept separate</p>
    </div>
  )
  if (!provider && !manager) return null
  return <>
    {compact ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">{provider ? "Your Ratings & Reviews" : "Customer Ratings & Reviews"}</h2><Button variant="ghost" icon={ArrowRight} onClick={open}>View all reviews</Button></div> : <PageHead title={provider ? "Your Ratings & Reviews" : "Customer Ratings & Reviews"} description={provider ? "Customer feedback for services you personally provided. Ratings are read-only." : "Feedback from completed appointments across your shop. Service and barber scores stay separate."} />}
    {!compact && manager && <div className="mb-5 space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Barber / service provider"><select value={filters.providerId} onChange={(event) => updateFilter("providerId", event.target.value)} className={inputClass}><option value="">All Barbers</option>{barbers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Service"><select value={filters.serviceId} onChange={(event) => updateFilter("serviceId", event.target.value)} className={inputClass}><option value="">All Services</option>{services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Rating score type"><select value={filters.scoreType} onChange={(event) => updateFilter("scoreType", event.target.value as ReviewFilters["scoreType"])} className={inputClass}><option value="service">Service rating</option><option value="provider">Barber rating</option></select></Field>
        <Field label="Rating score"><select value={filters.rating} onChange={(event) => updateFilter("rating", event.target.value)} className={inputClass}><option value="">All Ratings</option>{[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score} {score === 1 ? "Star" : "Stars"}</option>)}</select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Date range applies to"><select value={filters.dateType} onChange={(event) => updateFilter("dateType", event.target.value as ReviewFilters["dateType"])} className={inputClass}><option value="rating">Rating date</option><option value="appointment">Appointment date</option></select></Field>
        <Field label="From date"><input type="date" value={filters.start} max={filters.end || undefined} onChange={(event) => updateFilter("start", event.target.value)} className={inputClass} /></Field>
        <Field label="To date"><input type="date" value={filters.end} min={filters.start || undefined} onChange={(event) => updateFilter("end", event.target.value)} className={inputClass} /></Field>
        <Field label="Search feedback"><div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3"><Search size={15} className="shrink-0 text-muted-foreground" /><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Customer, barber, service…" className="min-h-10 min-w-0 w-full bg-transparent text-xs" /></div></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[14px] text-muted-foreground">Inclusive date ranges use Asia/Manila. Summary statistics reflect your filters.</p>{hasFilters && <Button variant="ghost" onClick={() => setFilters({ ...emptyReviewFilters })}>Clear filters</Button>}</div>
      {invalidRange && <ErrorBox message="The start date must be on or before the end date." />}
    </div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {provider ? scoreSummary("Barber Rating", providerAverage, providerScores.length) : scoreSummary("Overall Service Rating", serviceAverage, serviceScores.length)}
      {provider ? scoreSummary("Service Rating", serviceAverage, serviceScores.length) : scoreSummary("Barber Rating", providerAverage, providerScores.length)}
      <Metric label="Total Reviews" value={ready ? String(filtered.length) : "—"} note={compact ? "Verified completed appointments" : hasFilters ? `Matching ${entries.length} total shop reviews` : "Verified completed appointments"} icon={Users} />
    </div>
    {!compact && <section aria-label="Rating breakdown" className="mb-5 rounded-xl border border-border bg-card p-4"><h2 className="mb-4 text-sm font-semibold">{provider || filters.scoreType === "provider" ? "Barber" : "Service"} rating breakdown</h2><div className="grid gap-3 sm:grid-cols-5">{[5, 4, 3, 2, 1].map((score) => { const count = distribution.filter((rating) => rating === score).length; return <div key={score} className="rounded-lg bg-background p-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-1"><Star size={12} className="text-primary" fill="currentColor" />{score} {score === 1 ? "star" : "stars"}</span><strong>{ready ? count : "—"}</strong></div><progress max={Math.max(distribution.length, 1)} value={ready ? count : 0} aria-label={`${count} ${score}-star ratings out of ${distribution.length}`} className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" /></div> })}</div></section>}
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{compact ? "Recent customer feedback" : "Customer feedback"}</h2><span className="flex items-center gap-1 text-[14px] text-muted-foreground"><ShieldCheck size={14} />Verified visits · Read-only</span></div>
      <DataBoundary state={state}>{filtered.length ? <div className="divide-y divide-border">{(compact ? filtered.slice(0, 3) : filtered).map((entry) => <article key={entry.id} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{entry.customer}</h3><p className="mt-1 text-xs text-muted-foreground">{entry.service}{!provider ? ` · ${entry.provider}` : ""}</p></div><Badge>Completed</Badge></div>
        <div className="my-4 flex flex-wrap gap-x-8 gap-y-3"><div><p className="mb-1 text-xs font-medium">Service Rating</p><AppointmentStars value={entry.serviceRating} label="Service rating" /></div><div><p className="mb-1 text-xs font-medium">Barber Rating</p>{entry.providerRating !== undefined ? <AppointmentStars value={entry.providerRating} label="Barber rating" /> : <p className="text-xs text-muted-foreground">Not recorded for this older review</p>}</div></div>
        <p className={cx("whitespace-pre-wrap break-words text-xs leading-relaxed", !entry.comment && "text-muted-foreground")}>{entry.comment || "No written feedback provided."}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-muted-foreground"><span>Appointment: {formatDate(entry.appointmentDate)}</span><span>Rated: {formatDate(entry.ratingDate)}</span></div>
      </article>)}</div> : <Empty icon={Star} title={hasFilters ? "No matching reviews" : "No customer reviews yet"} description={hasFilters ? "Try another barber, service, score, or date range." : provider ? "Feedback appears here after a customer rates a completed service you provided." : "Customer feedback appears automatically after completed appointments are rated."} />}</DataBoundary>
    </div>
  </>
}

function NotificationBell({ count, open, toggle }: { count: number; open: boolean; toggle: () => void }) {
  return <Button variant="secondary" aria-label={`Notifications, ${count} unread`}
    aria-expanded={open} aria-controls="notification-panel" aria-pressed={open}
    className={cx("min-h-11 min-w-11 rounded-xl px-1 transition-all hover:border-primary/30 hover:bg-secondary active:scale-95 active:bg-accent", open && "border-primary/30 bg-secondary text-primary ring-2 ring-primary/15")}
    onClick={toggle}>
    <span className="relative inline-flex size-9 shrink-0 items-center justify-center">
      <Bell size={19} aria-hidden="true" />
      {count > 0 && <span aria-hidden="true" className="notification-count absolute -right-0.5 -top-0.5 grid size-4.5 place-items-center rounded-full border-2 border-white bg-destructive font-bold text-white">{count >= 10 ? "9+" : count}</span>}
    </span>
    <span className="hidden pr-2 xl:inline">Notifications</span>
  </Button>
}

function AdminEditStamp({ record }: { record: SmartCutRecord }) {
  if (!record.adminEditedAt) return null
  return <span className="mt-2 flex items-center gap-1.5 whitespace-normal text-xs text-muted-foreground">
    <ShieldCheck size={13} className="shrink-0 text-primary" />
    Last corrected · {formatTimestampManila(record.adminEditedAt)}
  </span>
}

function RecordDeleteButton({ record, collectionName, run, disabled }: {
  record: SmartCutRecord; collectionName: string; run: Action; disabled: boolean
}) {
  const [target, setTarget] = useState<Awaited<ReturnType<typeof readAdminShopRecord>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  return <>
    <Button variant="danger" disabled={disabled || loading || deleting} aria-label={`Delete record for ${record.client || record.id}`}
      onClick={async () => {
        setLoading(true); setError("")
        try { setTarget(await readAdminShopRecord(collectionName, record.id)) }
        catch (failure) { setError(friendlyError(failure)) }
        finally { setLoading(false) }
      }}>{loading ? "Opening…" : "Delete"}</Button>
    {!target && error && <ErrorBox message={error} />}
    {target && <Modal title="Permanently delete record?" subtitle="Temporary cleanup access · This cannot be undone." busy={deleting} close={() => setTarget(null)}>
      <div className="space-y-5 p-5">
        <div className="space-y-2 rounded-xl border border-border bg-background p-4">
          <span className="block font-semibold">{String(target.record.client || "Customer record")}</span>
          <span className="block text-sm text-muted-foreground">{String(target.record.service || "")} · {adminRecordDate(target.record.date)} · {peso(moneyNumber(target.record.amount))}</span>
          <span className="block break-all text-xs text-muted-foreground">Record ID: {target.record.id}</span>
        </div>
        <span className="block text-sm text-destructive">This permanently deletes the booking or walk-in, its linked sales and payment receipts, and any linked rating from Firebase. Booking slots are released. Live reports and totals will decrease. This is not a refund and does not return money to the customer.</span>
        {error && <ErrorBox message={error} />}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" disabled={deleting} onClick={() => setTarget(null)}>Keep record</Button>
          <Button variant="danger" disabled={deleting || disabled} onClick={() => {
            setDeleting(true); setError("")
            void run(async () => {
              try {
                await deleteShopRecord(target.shopId, target.collectionName, target.record)
                setTarget(null)
              } catch (failure) { setError(friendlyError(failure)); throw failure }
              finally { setDeleting(false) }
            }, "Record and linked receipts permanently deleted.")
          }}>{deleting ? "Deleting…" : "Delete permanently"}</Button>
        </div>
      </div>
    </Modal>}
  </>
}

function AdminRecordEditor({ target, run, close }: {
  target: Awaited<ReturnType<typeof readAdminShopRecord>>; run: Action; close: () => void
}) {
  const record = target.record
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(recordEditFields(record).map(([key]) => [key, record[key] ?? ""])))
  const [lines, setLines] = useState(() => Array.isArray(record.serviceNames)
    ? record.serviceNames.map((name, index) => ({ id: String((record.serviceIds as string[])?.[index] || ""), name: String(name), amount: String((record.serviceAmounts as number[])?.[index] ?? 0) })) : [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const change = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }))
  const groups = [
    { title: "Customer details", keys: ["client", "customerId", "email", "phone"] },
    { title: "Service & provider", keys: ["service", "serviceId", "provider", "providerId"] },
    { title: "Payment & status", keys: ["amount", "method", "status", "paymentStatus"] },
    { title: "Additional details", keys: ["notes", "rejectionReason"] },
  ]
  return <Modal title="Edit record details" subtitle="Administrator & shop owner access · Changes stay within this shop." close={close} busy={saving}>
    <form className="space-y-5 p-5" onSubmit={(event) => {
      event.preventDefault(); setError(""); setSaving(true)
      void run(async () => {
        try { await editAdminShopRecord(target.shopId, target.collectionName, record, { ...values, lines }); close() }
        catch (failure) { setError(friendlyError(failure)); throw failure }
        finally { setSaving(false) }
      }, "Record details updated.")
    }}>
      <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-secondary p-4 text-sm text-primary">
        <ShieldCheck size={20} className="shrink-0" /><span>Update the details below. The original date, time, and duration stay unchanged. Linked receipts and reports update together.</span>
      </div>
      {groups.map((group) => <div key={group.title} className="space-y-4 rounded-xl border border-border p-4">
        <span className="block text-sm font-semibold">{group.title}</span>
        <div className="grid gap-4 sm:grid-cols-2">
        {recordEditFields(record).filter(([key]) => group.keys.includes(key) && (!lines.length || !["service", "amount"].includes(key))).map(([key, label, type]) =>
          <Field key={key} label={key === "providerId" && record.type === "Walk-in" ? "Service provider UID" : label} hint={key === "status" ? (record.type === "Walk-in" ? "Pending, Accepted, In Service, Paid" : "Pending, Accepted, In Progress, Completed, Rated, Rejected, Cancelled") : key === "paymentStatus" ? "Paid or Unpaid" : key === "method" && record.type === "Walk-in" ? "Cash or E-wallet" : undefined}>
              <FinanceInput type={type} value={String(values[key] ?? "")} disabled={saving} required={["client", "service", "amount", "status"].includes(key)}
                min={type === "number" ? 0 : undefined} step={key === "amount" ? "0.01" : undefined}
                onChange={(event) => change(key, event.target.value)} />
          </Field>)}
        </div>
      </div>)}
      {!!lines.length && <div className="space-y-3 rounded-xl border border-border p-4">
        <span className="text-sm font-semibold">Walk-in services</span>
        {lines.map((line, index) => <div key={index} className="grid gap-3 border-t border-border pt-3">
          {(["id", "name", "amount"] as const).map((key) => <Field key={key} label={key === "id" ? "Service ID" : key === "name" ? "Service name" : "Amount (PHP)"}>
            <FinanceInput value={line[key]} type={key === "amount" ? "number" : "text"} min={key === "amount" ? 0 : undefined}
              step={key === "amount" ? "0.01" : undefined} required disabled={saving}
              onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} />
          </Field>)}
          <Button variant="ghost" disabled={saving || lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove service</Button>
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" icon={Plus} disabled={saving} onClick={() => setLines((current) => [...current, { id: "", name: "", amount: "0" }])}>Add service</Button>
          <span className="text-sm font-semibold">Total: {peso(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0))}</span>
        </div>
      </div>}
      <span className="block text-xs text-muted-foreground">Record ID: {record.id}. Original creation details are preserved; this edit receives a server timestamp.</span>
      <AdminEditStamp record={record} />
      {error && <ErrorBox message={error} />}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" disabled={saving} onClick={close}>Cancel</Button>
        <Button type="submit" icon={Check} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  </Modal>
}

function AppointmentStars({ value, label, onChange, disabled = false }: {
  value: number
  label: string
  onChange?: (value: number) => void
  disabled?: boolean
}) {
  return <div className="flex items-center gap-1" role={onChange ? "group" : undefined} aria-label={onChange ? label : `${label}: ${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((rating) => onChange ? <button key={rating} type="button" disabled={disabled} aria-label={`${label}: ${rating} stars`} aria-pressed={value === rating} onClick={() => onChange(rating)} className="rounded-md p-2 text-primary transition-colors hover:bg-secondary disabled:opacity-50"><Star size={25} fill={rating <= value ? "currentColor" : "none"} /></button> : <Star key={rating} size={15} className="text-primary" fill={rating <= value ? "currentColor" : "none"} />)}
    {!onChange && <span className="ml-1 text-xs text-muted-foreground">{value}/5</span>}
  </div>
}
function AppointmentReviewSummary({ review }: { review: SmartCutRecord }) {
  return <section aria-label="Your submitted rating" className="space-y-3 rounded-lg border border-border bg-background p-4">
    <p className="flex items-center gap-2 text-xs font-semibold text-primary"><CheckCircle2 size={15} />Your rating has been submitted</p>
    <div className="flex flex-wrap gap-5"><div><p className="mb-1 text-xs text-muted-foreground">Service</p><AppointmentStars value={Number(review.serviceRating || review.rating || 0)} label="Service rating" /></div>{typeof review.providerRating === "number" && <div><p className="mb-1 text-xs text-muted-foreground">Barber / service provider</p><AppointmentStars value={review.providerRating} label="Provider rating" /></div>}</div>
    {review.comment ? <p className="whitespace-pre-wrap break-words text-xs text-foreground">{String(review.comment)}</p> : null}
    <p className="text-[14px] text-muted-foreground">One completed appointment, one review. Thank you for your feedback!</p>
  </section>
}
function AppointmentDetails({ record, role, reviews, startRating, allowManagerDecision = false, busy, run, close }: {
  record: SmartCutRecord
  role: UserRole
  reviews: CollectionState
  startRating: boolean
  allowManagerDecision?: boolean
  busy: boolean
  run: Action
  close: () => void
}) {
  const [ratingOpen, setRatingOpen] = useState(startRating)
  const [serviceRating, setServiceRating] = useState(0)
  const [providerRating, setProviderRating] = useState(0)
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [decision, setDecision] = useState<"Accepted" | "Rejected" | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [decisionSaved, setDecisionSaved] = useState(false)
  const status = appointmentStatus(record.status)
  const review = reviews.records.find((item) => item.appointmentId === record.id)
  const eligible = role === "Customer" && status === "Completed" && !review && !submitted && reviews.status === "connected"
  const stage = ["Pending", "Accepted", "In Progress", "Completed", "Rated"].indexOf(status)
  const time = (value: unknown) => {
    const date = (value as { toDate?: () => Date })?.toDate?.()
    return date ? date.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : ""
  }
  const steps = [
    ["Appointment requested", "Customer books", record.createdAt],
    ["Manager accepted", "Manager approves", record.acceptedAt],
    ["Service started", "Manager or assigned provider starts", record.startedAt],
    ["Service completed", "Manager or assigned provider completes", record.completedAt],
    [status === "Rated" || review ? "Experience rated" : "Rate your experience", "Customer shares feedback", record.ratedAt],
  ]
  return <Modal title="Appointment details" subtitle={`${String(record.service)} · ${String(record.provider)}`} close={close} busy={busy}>
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Current appointment status</p><Badge>{status}</Badge></div>
      <dl className="grid grid-cols-2 gap-4">{[["Customer", bookingClient(record)], ["Service", record.service], ["Barber / service provider", record.provider], ["Date & time", `${String(record.date)} · ${formatTime12(record.time)} (Asia/Manila)`]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{String(label)}</dt><dd className="mt-1 text-sm font-semibold">{String(value)}</dd></div>)}</dl>
      {record.notes ? <div><p className="text-xs font-semibold">Customer notes</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{String(record.notes)}</p></div> : null}
      <section className="border-y border-border py-4"><h3 className="mb-4 text-sm font-semibold">Status timeline</h3>{stage < 0 ? <div className="rounded-lg bg-muted p-3"><Badge>{status}</Badge><p className="mt-2 text-xs text-muted-foreground">{status === "Rejected" ? String(record.rejectionReason || "The manager rejected this appointment request.") : "This appointment has been cancelled. No further service steps are scheduled."}</p></div> : <ol className="space-y-4">{steps.map(([label, responsibility, timestamp], index) => <li key={String(label)} aria-current={index === stage ? "step" : undefined} className="flex items-start gap-3"><span className={cx("grid size-6 shrink-0 place-items-center rounded-full border", index <= stage ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground")}>{index <= stage ? <Check size={13} /> : index === 4 ? <Star size={12} /> : <span className="size-1.5 rounded-full bg-current" />}</span><div><p className={cx("text-xs font-semibold", index > stage && "text-muted-foreground")}>{String(label)}</p><p className="mt-0.5 text-[14px] text-muted-foreground">{String(responsibility)}{time(timestamp) ? ` · ${time(timestamp)}` : ""}</p></div></li>)}</ol>}</section>
      {role === "Customer" && ["Completed", "Rated"].includes(status) && <DataBoundary state={reviews}>{review ? <AppointmentReviewSummary review={review} /> : status === "Rated" ? <p className="text-xs text-primary">Your rating has already been submitted.</p> : null}</DataBoundary>}
      {submitted && <p role="status" className="rounded-lg bg-secondary p-3 text-sm font-semibold text-primary">Thank you for your feedback!</p>}
      {eligible && !ratingOpen && <Button icon={Star} disabled={busy} className="w-full" onClick={() => setRatingOpen(true)}>Rate Your Experience</Button>}
      {eligible && ratingOpen && <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault()
        setError("")
        if (!serviceRating || !providerRating) { setError("Please rate both your service and your barber."); return }
        void run(async () => {
          try { await submitAppointmentReview(record.id, serviceRating, providerRating, comment); setSubmitted(true); setRatingOpen(false) } catch (failure) { setError(friendlyError(failure)); throw failure }
        }, "Thank you for your feedback!")
      }}>
        <fieldset disabled={busy} className="space-y-4"><div><p className="mb-1 text-sm font-semibold">How was your service?</p><AppointmentStars value={serviceRating} onChange={setServiceRating} label="Overall service" disabled={busy} /></div><div><p className="mb-1 text-sm font-semibold">How was your barber/service provider?</p><AppointmentStars value={providerRating} onChange={setProviderRating} label="Barber / service provider" disabled={busy} /></div><Field label="Additional feedback (optional)"><textarea rows={3} maxLength={1000} className={inputClass} placeholder="Write your feedback…" value={comment} onChange={(event) => setComment(event.target.value)} /></Field>{error && <ErrorBox message={error} />}<p className="text-xs text-muted-foreground">Your review is linked to this visit and its assigned provider. You can submit it only once.</p><Button type="submit" disabled={busy || !serviceRating || !providerRating} className="w-full">{busy ? "Submitting…" : "Submit Rating"}</Button></fieldset>
      </form>}
      {allowManagerDecision && role === "Manager" && status === "Pending" && !decisionSaved && <section className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-semibold">Review appointment request</p>
        {!decision ? <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => { setError(""); setDecision("Accepted") }}>Accept Appointment</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setError(""); setDecision("Rejected") }}>Reject Appointment</Button>
        </div> : <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          setError("")
          void run(async () => {
            try {
              await updateAppointmentStatus(record.id, decision, decision === "Rejected" ? rejectionReason.trim() : "")
              setDecisionSaved(true)
              setDecision(null)
            } catch (failure) { setError(friendlyError(failure)); throw failure }
          }, decision === "Accepted" ? "Appointment accepted and customer notified." : "Appointment rejected and customer notified.")
        }}>
          <p className="text-sm">{decision === "Accepted" ? "Accept this appointment?" : "Reject this appointment?"} The customer will be notified of your decision.</p>
          {decision === "Rejected" && <Field label="Reason (optional)"><textarea className={inputClass} rows={3} maxLength={1000} disabled={busy} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Explain why this request cannot be accepted…" /></Field>}
          {error && <ErrorBox message={error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setDecision(null); setError("") }}>Go back</Button>
            <Button type="submit" variant={decision === "Rejected" ? "danger" : "primary"} disabled={busy}>{busy ? "Saving…" : decision === "Accepted" ? "Confirm acceptance" : "Confirm rejection"}</Button>
          </div>
        </form>}
      </section>}
      {decisionSaved && <p role="status" className="text-sm font-semibold text-primary">Your decision has been saved. The customer has been notified.</p>}
      {status === "Pending" && !decisionSaved && <p className="text-xs text-muted-foreground">{role === "Manager" ? "This appointment request is waiting for your approval." : "Your appointment request is waiting for manager approval."}</p>}
    </div>
  </Modal>
}

function Appointments({
  state,
  role,
  providerUid,
  canEditRecords = false,
  reviews,
  busy,
  run,
  onCheckout,
  onBook,
  providers = [],
  initialFilter = "All statuses",
}: {
  state: CollectionState
  role: UserRole
  providerUid: string
  canEditRecords?: boolean
  reviews: CollectionState
  busy: boolean
  run: Action
  onCheckout: (record: SmartCutRecord) => void
  onBook: () => void
  providers?: SmartCutRecord[]
  initialFilter?: string
}) {
  const [view, setView] = useState<"List" | "Week">("List")
  const [filter, setFilter] = useState(initialFilter)
  const [search, setSearch] = useState("")
  const [week, setWeek] = useState(manilaDate())
  const [cancel, setCancel] = useState<SmartCutRecord | null>(null)
  const [details, setDetails] = useState<{ id: string; rating: boolean } | null>(null)
  const [confirmation, setConfirmation] = useState<{ record: SmartCutRecord; next: string } | null>(null)
  const [reason, setReason] = useState("")
  const [actionError, setActionError] = useState("")
  const [assignment, setAssignment] = useState<SmartCutRecord | null>(null)
  const [assignmentProviderId, setAssignmentProviderId] = useState("")
  const [dateStart, setDateStart] = useState("")
  const [dateEnd, setDateEnd] = useState("")
  const actionBusy = busy || state.status !== "connected"
  const visibleRecords = state.records.filter((record) => role !== "Service Provider" ||
    ((record.providerId === providerUid || (record.providerId === "" && record.providerPreference === "any" && record.status === "Accepted")) &&
      !["Pending", "Rejected", "Cancelled"].includes(appointmentStatus(record.status))))
    .filter((record) => (!dateStart || String(record.date) >= dateStart) && (!dateEnd || String(record.date) <= dateEnd))
  const monday = new Date(`${week}T12:00:00+08:00`)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setUTCDate(day.getUTCDate() + index)
    return manilaDate(day)
  })
  const filtered = [...visibleRecords]
    .filter(
      (record) =>
        (filter === "All statuses" || (filter === "Record payment" ? awaitingPayment(record) : appointmentStatus(record.status) === filter)) &&
        `${record.client} ${record.service} ${record.provider} ${record.date}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((first, second) =>
      `${first.date} ${first.time}`.localeCompare(
        `${second.date} ${second.time}`,
      ),
    )
  const summaryStatuses = ["All statuses", ...(role === "Service Provider" ? [] : ["Pending"]), "Accepted", "In Progress", "Completed", ...((isManager(role) || role === "Service Provider") ? ["Record payment"] : [])]
  const awaitingService = [...visibleRecords]
    .filter((record) => appointmentStatus(record.status) === "Accepted")
    .sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`))
  const dayGroups = new Map<string, SmartCutRecord[]>()
  filtered.forEach((record) => {
    const date = String(record.date || "Date not recorded")
    const group = dayGroups.get(date)
    if (group) group.push(record)
    else dayGroups.set(date, [record])
  })
  const dateHeading = (date: string) => {
    const value = new Date(`${date}T12:00:00+08:00`)
    return Number.isFinite(value.getTime())
      ? value.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
      : date
  }
  const actionClass = "w-full sm:w-40"
  const change = (record: SmartCutRecord, next: string) => {
    setActionError("")
    setReason("")
    setConfirmation({ record, next })
  }
  const chooseProvider = (record: SmartCutRecord) => {
    setActionError("")
    setAssignmentProviderId(role === "Service Provider" ? providerUid : "")
    setAssignment(record)
  }
  return (
    <>
      <PageHead
        title={
          role === "Customer"
            ? "Your appointments"
            : role === "Service Provider"
              ? "My appointments"
              : "Appointment desk"
        }
        description={
          role === "Service Provider"
            ? "Start and complete your assigned services. Take an unassigned accepted booking only when the customer agrees."
            : role === "Customer"
              ? "Book, track, and rate your completed visit. All times are Asia/Manila."
              : "Managers manage all booking stages; providers start and complete their assigned services. All times are Asia/Manila."
        }
      >
        {isManager(role) && (
          <Button icon={Plus} onClick={onBook}>
            New appointment
          </Button>
        )}
        {state.records.length > 0 && (
          <Button
            variant="secondary"
            icon={ArrowDownToLine}
            disabled={state.status !== "connected"}
            onClick={() =>
              download(
                "appointments",
                [
                  "Date",
                  "Time",
                  "Client",
                  "Service",
                  "Service Provider",
                  "Status",
                  ...(role === "Service Provider" ? [] : ["PHP"]),
                  "Payment status",
                  "Duration",
                  "Notes",
                  "Appointment ID",
                ],
                filtered.filter((record) => view !== "Week" || days.includes(String(record.date))).map((record) => [
                  String(record.date || ""),
                  formatTime12(record.time),
                  bookingClient(record),
                  String(record.service || "Service not recorded"),
                  String(record.provider || "Not assigned"),
                  appointmentStatus(record.status),
                  ...(role === "Service Provider" ? [] : [peso(bookingAmount(record))]),
                  String(record.paymentStatus || "Unpaid"),
                  record.durationMinutes ? `${record.durationMinutes} minutes` : String(record.duration || "Duration not recorded"),
                  String(record.notes || ""),
                  record.id,
                ]),
              )
            }
          >
            Export
          </Button>
        )}
      </PageHead>
      <SalesDateFilter label="Appointment dates" start={dateStart} end={dateEnd} change={(start, end) => { setDateStart(start); setDateEnd(end) }} />
      <div className={cx("mb-5 grid grid-cols-2 gap-3", isManager(role) ? "sm:grid-cols-3 2xl:grid-cols-6" : "lg:grid-cols-5")} role="group" aria-label="Appointment status overview">
        {summaryStatuses.map((status) => {
          const count = status === "All statuses" ? visibleRecords.length : visibleRecords.filter((record) => status === "Record payment" ? awaitingPayment(record) : appointmentStatus(record.status) === status).length
          const label = status === "All statuses" ? "All bookings" : status === "Pending" ? "Awaiting approval" : status === "Accepted" ? "Awaiting service to start" : status === "In Progress" ? "In service" : status === "Record payment" ? "Record payment" : "Completed"
          return <Button key={status} variant={filter === status ? "booking" : "secondary"} aria-pressed={filter === status}
            className="justify-between rounded-xl p-4 text-left" onClick={() => { setFilter(status); if (status === "Record payment") setView("List") }}>
            <span className="grid gap-2"><span className="text-xs font-medium">{label}</span><span className="font-display text-2xl font-bold tabular-nums">{state.status === "connected" ? count : "—"}</span></span>
            {status === "All statuses" ? <CalendarDays size={20} /> : status === "Completed" ? <CheckCircle2 size={20} /> : status === "In Progress" ? <Scissors size={20} /> : status === "Record payment" ? <CreditCard size={20} /> : <Clock3 size={20} />}
          </Button>
        })}
      </div>
      {role !== "Customer" && filter !== "Record payment" && (
        <div className="mb-5 rounded-xl border border-border bg-card p-4 sm:p-5" role="region" aria-label="Awaiting Service to Start">
          <PageHead title="Awaiting Service to Start" description="Accepted bookings stay here until service starts. Confirm the customer has arrived before starting." />
          <DataBoundary state={state}>
            {awaitingService.length ? (
              <div className="grid gap-3">
                {awaitingService.map((record) => (
                  <div key={record.id} className="grid gap-3 rounded-lg border border-border p-4">
                    <BookingLine record={record} highlighted showAmount={role !== "Service Provider"} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Accepted · waiting for the customer to arrive</span>
                      {record.providerId === "" && record.providerPreference === "any" && (
                        <Button disabled={actionBusy} variant="booking" className={actionClass} icon={Users} onClick={() => chooseProvider(record)}>
                          {isManager(role) ? "Assign provider" : "Take this booking"}
                        </Button>
                      )}
                      {!!record.scheduleId && !!record.providerId && (isManager(role) || (role === "Service Provider" && record.providerId === providerUid)) && (
                        <Button disabled={actionBusy} variant="booking" className={actionClass} icon={Scissors} onClick={() => change(record, "In Progress")}>
                          Start service
                        </Button>
                      )}
                      {!record.scheduleId && <span className="text-xs text-muted-foreground">Legacy booking — needs migration before editing</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={Clock3} title="No bookings awaiting service" description="Bookings appear here as soon as a manager accepts them." />
            )}
          </DataBoundary>
        </div>
      )}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <label className="flex min-h-11 min-w-40 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Search size={15} className="text-muted-foreground" />
            <input
              aria-label="Search appointments"
              className="min-w-0 w-full bg-transparent text-sm"
              placeholder="Search client, service, date…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter appointment status"
            className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {[
              "All statuses",
              "Pending",
              "Accepted",
              "In Progress",
              "Completed",
              ...((isManager(role) || role === "Service Provider") ? ["Record payment"] : []),
              "Rated",
              "Rejected",
              "Cancelled",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Appointment view">
            {(["List", "Week"] as const).map((item) => (
              <Button
                aria-pressed={view === item}
                key={item}
                onClick={() => setView(item)}
                variant={view === item ? "booking" : "ghost"}
                className="min-w-20"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
        <DataBoundary state={state}>
          {view === "Week" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    icon={ChevronLeft}
                    aria-label="Previous week"
                    onClick={() => {
                      const day = new Date(`${week}T12:00:00+08:00`)
                      day.setUTCDate(day.getUTCDate() - 7)
                      setWeek(manilaDate(day))
                    }}
                  />
                  <Button variant="booking" onClick={() => setWeek(manilaDate())}>
                    Today
                  </Button>
                  <Button
                    variant="ghost"
                    icon={ChevronRight}
                    aria-label="Next week"
                    onClick={() => {
                      const day = new Date(`${week}T12:00:00+08:00`)
                      day.setUTCDate(day.getUTCDate() + 7)
                      setWeek(manilaDate(day))
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {days[0]} — {days[6]}
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="grid min-w-[900px] grid-cols-7">
                  {days.map((day) => (
                    <div
                      key={day}
                      className="min-h-64 border-r border-border p-2 last:border-r-0"
                    >
                      <div
                        className={cx(
                          "mb-3 rounded-lg py-2 text-center",
                          day === manilaDate() && "bg-secondary text-primary",
                        )}
                      >
                        <span className="block text-[14px]">
                          {new Date(`${day}T12:00:00+08:00`).toLocaleDateString(
                            "en-PH",
                            { weekday: "short", timeZone: "Asia/Manila" },
                          )}
                        </span>
                        <strong className="text-lg">{day.slice(-2)}</strong>
                      </div>
                      {filtered
                        .filter((record) => record.date === day)
                        .map((record) => (
                          <Button
                            variant="secondary"
                            onClick={() => setDetails({ id: record.id, rating: false })}
                            aria-label={"View appointment for " + bookingClient(record)}
                            key={record.id}
                            className="mb-2 w-full flex-col items-start gap-1 text-left"
                          >
                            <span className="text-xs font-semibold">
                              {formatTime12(record.time)} ·{" "}
                              {record.durationMinutes
                                ? `${record.durationMinutes}m`
                                : String(record.duration || "")}
                            </span>
                            <span className="w-full truncate text-sm font-semibold text-foreground">
                              {bookingClient(record)}
                            </span>
                            <span className="w-full truncate text-xs text-muted-foreground">
                              {String(record.service)}
                            </span>
                            <span className="w-full truncate text-xs text-muted-foreground">{String(record.provider)}</span>
                            <Badge>{appointmentStatus(record.status)}</Badge>
                          </Button>
                        ))}
                      {!filtered.some((record) => record.date === day) && (
                        <p className="pt-4 text-center text-[14px] text-muted-foreground">
                          No bookings
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <p className="border-t border-border p-3 text-[14px] text-muted-foreground">
                Switch to List to manage statuses and payments. Empty space is
                not a guarantee of availability; booking checks run
                transactionally.
              </p>
            </>
          ) : filtered.length ? (
            <div className="grid gap-6 bg-background p-3 sm:p-5">
              {Array.from(dayGroups).map(([date, records]) => <div key={date} className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-primary" />{date === manilaDate() ? "Today · " : ""}{dateHeading(date)}</span>
                  <span className="text-xs text-muted-foreground">{records.length} {records.length === 1 ? "booking" : "bookings"}</span>
                </div>
              {records.map((record) => (
                <div
                  key={record.id}
                  className={cx(
                    "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5",
                    appointmentStatus(record.status) === "Pending" && "ring-1 ring-amber-200",
                  )}
                >
                  <BookingLine record={record} highlighted showAmount={role !== "Service Provider"} />
                  {!!record.notes && <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs">
                    <span className="font-semibold">Client note</span>
                    <span className="mt-1 block line-clamp-2 break-words text-muted-foreground">{String(record.notes)}</span>
                  </div>}
                  <div className="grid gap-3 pt-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={14} className="text-primary" />
                        {record.durationMinutes
                          ? `${record.durationMinutes} minutes`
                          : String(record.duration || "Duration not recorded")}
                      </span>
                      <span className="text-xs font-medium">Payment</span><Badge>{String(record.paymentStatus || "Unpaid")}</Badge>
                    </div>
                    <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      {canEditRecords && <RecordDeleteButton record={record} collectionName="appointments" run={run} disabled={actionBusy} />}
                      {!record.scheduleId ? (
                        <>
                          <span className="text-[14px] text-amber-700">
                            Legacy booking — needs migration before editing
                          </span>
                          {isManager(role) &&
                            !["Completed", "Rated", "Rejected", "Cancelled"].includes(
                              appointmentStatus(record.status),
                            ) && (
                              <Button
                                disabled={actionBusy}
                                variant="danger"
                                className={actionClass}
                                icon={X}
                                onClick={() => { setActionError(""); setCancel(record) }}
                              >
                                Cancel booking
                              </Button>
                            )}
                        </>
                      ) : (
                        <>
                          {isManager(role) && appointmentStatus(record.status) === "Pending" && (
                            <Button
                              disabled={actionBusy}
                              variant="primary"
                              className={actionClass}
                              icon={Check}
                              onClick={() => change(record, "Accepted")}
                            >
                              Accept booking
                            </Button>
                          )}
                          {isManager(role) && appointmentStatus(record.status) === "Pending" && <Button disabled={actionBusy} variant="danger" className={actionClass} icon={X} onClick={() => change(record, "Rejected")}>Reject booking</Button>}
                          {record.providerId === "" && record.providerPreference === "any" && appointmentStatus(record.status) === "Accepted" &&
                            (isManager(role) || role === "Service Provider") && (
                            <Button disabled={actionBusy} variant="booking" className={actionClass} icon={Users} onClick={() => chooseProvider(record)}>
                              {isManager(role) ? "Assign provider" : "Take this booking"}
                            </Button>
                          )}
                          {!!record.providerId && (isManager(role) || (role === "Service Provider" && record.providerId === providerUid)) &&
                            appointmentStatus(record.status) === "Accepted" && (
                              <Button
                                disabled={actionBusy}
                                variant="booking"
                                className={actionClass}
                                icon={Scissors}
                                onClick={() => change(record, "In Progress")}
                              >
                                Start service
                              </Button>
                            )}
                          {(isManager(role) || (role === "Service Provider" && record.providerId === providerUid)) &&
                            appointmentStatus(record.status) === "In Progress" && (
                              <Button
                                disabled={actionBusy}
                                className={actionClass}
                                icon={CheckCircle2}
                                onClick={() => change(record, "Completed")}
                              >
                                Complete service
                              </Button>
                            )}
                          {((isManager(role) &&
                            !["Completed", "Rated", "Rejected", "Cancelled"].includes(
                              appointmentStatus(record.status),
                            )) ||
                            (role === "Customer" &&
                              ["Pending", "Accepted"].includes(
                                appointmentStatus(record.status),
                              ))) && (
                            <Button
                              disabled={actionBusy}
                              variant="danger"
                              className={actionClass}
                              icon={X}
                              onClick={() => { setActionError(""); setCancel(record) }}
                            >
                              Cancel
                            </Button>
                          )}
                        </>
                      )}
                      {(isManager(role) || (role === "Service Provider" && record.providerId === providerUid)) &&
                        awaitingPayment(record) && (
                        <Button disabled={actionBusy} icon={CreditCard} className={actionClass} onClick={() => onCheckout(record)}>
                          Record payment
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className={actionClass}
                        icon={ArrowRight}
                        onClick={() =>
                          setDetails({ id: record.id, rating: false })
                        }
                      >
                        View details
                      </Button>
                      {role === "Customer" && appointmentStatus(record.status) === "Completed" && !reviews.records.some((review) => review.appointmentId === record.id) && <Button className={actionClass} icon={Star} disabled={actionBusy || reviews.status !== "connected"} onClick={() => setDetails({ id: record.id, rating: true })}>Rate your visit</Button>}
                    </div>
                  </div>
                  {role === "Customer" && reviews.records.find((review) => review.appointmentId === record.id) && <div className="mt-3 sm:ml-20"><AppointmentReviewSummary review={reviews.records.find((review) => review.appointmentId === record.id)!} /></div>}
                </div>
              ))}
              </div>)}
            </div>
          ) : (
            <Empty
              title={
                search || filter !== "All statuses"
                  ? "No matching appointments"
                  : "Your schedule starts here"
              }
              description={filter === "Record payment" ? "No completed unpaid bookings match this search. Paid bookings leave this filter automatically." : "Appointments appear only after they are saved to Firebase. Try a different filter or create a booking."}
            />
          )}
        </DataBoundary>
      </div>
      {confirmation && <Modal title={confirmation.next === "Accepted" ? "Accept this appointment?" : confirmation.next === "Rejected" ? "Reject this appointment?" : confirmation.next === "In Progress" ? "Start this service?" : "Complete this service?"} close={() => setConfirmation(null)} busy={busy}>
        <div className="space-y-4 p-5">
          <span className="block text-sm font-semibold">{bookingClient(confirmation.record)} · {String(confirmation.record.service)}</span>
          <span className="block text-xs text-muted-foreground">{String(confirmation.record.date)} at {formatTime12(confirmation.record.time)} · {String(confirmation.record.provider)}</span>
          <span className="block text-xs text-muted-foreground">{confirmation.next === "In Progress" ? "Confirm that the customer has arrived and you are starting their service." : confirmation.next === "Completed" ? "Confirm that the service is finished. Your customer will be invited to rate their experience." : "The customer will receive a notification with your decision."}</span>
          {confirmation.next === "Rejected" && <Field label="Reason (optional)">
            <textarea className={inputClass} maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this request cannot be accepted…" />
          </Field>}
          {actionError && <ErrorBox message={actionError} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Go back</Button>
            <Button disabled={actionBusy}
              variant={confirmation.next === "Rejected" ? "danger" : confirmation.next === "In Progress" ? "booking" : "primary"}
              onClick={() => void run(async () => {
                setActionError("")
                try {
                  await updateAppointmentStatus(confirmation.record.id, confirmation.next, reason)
                  setConfirmation(null)
                } catch (failure) {
                  setActionError(friendlyError(failure))
                  throw failure
                }
              }, "Appointment updated and customer notified.")}>
              {busy ? "Saving…" : confirmation.next === "Accepted" ? "Accept booking" : confirmation.next === "Rejected" ? "Reject booking" : confirmation.next === "In Progress" ? "Start service" : "Complete service"}
            </Button>
          </div>
        </div>
      </Modal>}
      {assignment && <Modal title={isManager(role) ? "Assign a service provider" : "Take this booking?"} close={() => setAssignment(null)} busy={busy}>
        <div className="grid gap-4 p-5">
          <BookingLine record={assignment} showAmount={isManager(role)} />
          <span className="text-sm text-muted-foreground">Confirm the customer has arrived and agrees to this provider. Their chosen provider must be available for the reserved service time.</span>
          {isManager(role) && <Field label="Available service provider" hint="Availability is checked again when you confirm.">
            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => <Button key={provider.id} variant={assignmentProviderId === provider.id ? "booking" : "secondary"} aria-pressed={assignmentProviderId === provider.id} disabled={actionBusy} onClick={() => setAssignmentProviderId(provider.id)}>{String(provider.name)}</Button>)}
            </div>
          </Field>}
          {actionError && <ErrorBox message={actionError} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setAssignment(null)}>Cancel</Button>
            <Button disabled={actionBusy || !assignmentProviderId} onClick={() => void run(async () => {
              setActionError("")
              try {
                await assignAppointmentProvider(assignment.id, assignmentProviderId)
                setAssignment(null)
              } catch (failure) {
                setActionError(friendlyError(failure))
                throw failure
              }
            }, "Provider assigned. Start service when ready.")}>{busy ? "Assigning…" : "Confirm assignment"}</Button>
          </div>
        </div>
      </Modal>}
      {details && state.records.find((record) => record.id === details.id) && <AppointmentDetails key={details.id} record={state.records.find((record) => record.id === details.id)!} role={role} reviews={reviews} startRating={details.rating} busy={actionBusy} run={run} close={() => setDetails(null)} />}
      {cancel && (
        <Modal
          title="Cancel this appointment?"
          close={() => setCancel(null)}
          busy={actionBusy}
        >
          <div className="p-5">
            <p className="text-sm">
              {bookingClient(cancel)} · {String(cancel.service)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {String(cancel.date)} at {formatTime12(cancel.time)}. The reserved time
              will be released for another booking. This cannot be undone.
            </p>
            {actionError && <ErrorBox message={actionError} />}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                disabled={actionBusy}
                variant="secondary"
                onClick={() => setCancel(null)}
              >
                Keep booking
              </Button>
              <Button
                disabled={actionBusy}
                variant="danger"
                onClick={() =>
                  void run(async () => {
                    try { await updateAppointmentStatus(cancel.id, "Cancelled") } catch (failure) { setActionError(friendlyError(failure)); throw failure }
                    setCancel(null)
                  }, "Appointment cancelled and reserved time released.")
                }
              >
                Cancel appointment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function Services({
  state,
  services,
  role,
  manage,
  canCreate,
  edit,
  book,
  canBook,
}: {
  state: CollectionState
  services: Service[]
  role: UserRole
  manage: boolean
  canCreate: boolean
  edit: (service: Service | null) => void
  book: (id: string) => void
  canBook: boolean
}) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const customerView = role === "Customer"
  const visible = services.filter(
    (service) =>
      !customerView || (service.status === "Active" && !service.legacy),
  )
  const categories = [
    "All",
    ...new Set(visible.map((service) => service.category)),
  ]
  const filtered = visible.filter(
    (service) =>
      (category === "All" || service.category === category) &&
      `${service.name} ${service.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  return (
    <>
      <PageHead
        title={customerView ? "Services" : "Services & catalog"}
        description={
          customerView
            ? "Explore the live service menu and book your next visit. Prices are in Philippine pesos."
            : "Manage one service menu for the customer catalog, booking duration, availability, and pricing."
        }
      >
        {manage && canBook && <Button variant="secondary" icon={CalendarDays} onClick={() => book("")}>Book a Service</Button>}
        {canCreate && (
          <Button icon={Plus} onClick={() => edit(null)}>
            Add service
          </Button>
        )}
      </PageHead>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Search size={15} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search services"
            placeholder="Search services or categories…"
            className="w-full text-xs"
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            {categories.map((item) => (
              <Button
                key={item}
                variant={item === category ? "primary" : "secondary"}
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        )}
        <DataBoundary state={state}>
          {filtered.length ? (
            <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((service) => (
                <div
                  className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background"
                  key={service.id}
                >
                  {service.imageUrl ? (
                    <img
                      src={service.imageUrl}
                      alt={service.name}
                      loading="lazy"
                      className="h-48 w-full shrink-0 object-cover sm:h-56"
                    />
                  ) : (
                    <div className="grid h-48 shrink-0 place-items-center bg-secondary text-primary sm:h-56">
                      <span className="grid size-11 place-items-center rounded-xl bg-card shadow-sm">
                        <Scissors size={20} />
                      </span>
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-display text-base font-bold leading-snug">
                          {service.name}
                        </p>
                        <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                          {service.category}
                        </p>
                      </div>
                      <Badge>{service.status}</Badge>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[14px] text-muted-foreground">
                          Price
                        </p>
                        <p className="mt-0.5 text-base font-bold tabular-nums">
                          {peso(service.amount)}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 size={14} />
                        {service.durationMinutes} min
                      </span>
                    </div>
                    {(manage ||
                      (canBook &&
                        service.status === "Active" &&
                        !service.legacy)) && (
                      <div className="mt-auto flex flex-wrap gap-2 pt-5">
                        {manage && (
                          <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={() => edit(service)}
                          >
                            {service.legacy
                              ? "Review & migrate"
                              : "Edit service"}
                          </Button>
                        )}
                        {canBook &&
                          service.status === "Active" &&
                          !service.legacy && (
                            <Button
                              icon={ArrowRight}
                              className="flex-1"
                              onClick={() => book(service.id)}
                            >
                              {manage ? "Book a Service" : "Book service"}
                            </Button>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={Scissors}
              title={
                customerView
                  ? "The menu is being prepared"
                  : "No services found"
              }
              description={
                customerView
                  ? "Active services will appear here as soon as the business publishes its menu."
                  : "Add your real service menu. Prices and durations will be used automatically when booking."
              }
            />
          )}
        </DataBoundary>
      </div>
    </>
  )
}
function LegacyCatalog({
  state,
  serviceRecords,
  edit,
}: {
  state: CollectionState
  serviceRecords: SmartCutRecord[]
  edit: (service: Service | null) => void
}) {
  const pending = state.records.filter(
    (record) =>
      !serviceRecords.some((service) => service.sourceCatalogId === record.id),
  )
  if (state.status === "connected" && !pending.length) return null
  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Existing catalog items</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Older catalog records are preserved. Review their price and duration
        before importing them into the unified service library.
      </p>
      <DataBoundary state={state}>
        {pending.map((record) => (
          <div
            key={record.id}
            className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3"
          >
            <div>
              <p className="text-xs font-semibold">
                {String(
                  record.name || record.rows?.[0] || "Untitled catalog item",
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {String(record.category || record.rows?.[1] || "")}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                edit({
                  id: "",
                  sourceCatalogId: record.id,
                  name: String(record.name || record.rows?.[0] || ""),
                  category: String(
                    record.category || record.rows?.[1] || "General",
                  ),
                  amount: numeric(record.amount ?? record.rows?.[2]),
                  durationMinutes: Number(
                    record.durationMinutes ||
                      parseInt(record.rows?.[3] || "60"),
                  ),
                  status: "Active",
                  legacy: true,
                })
              }
            >
              Review & import
            </Button>
          </div>
        ))}
      </DataBoundary>
    </section>
  )
}
function Customers({
  state,
  appointments,
  account,
  canEditRecords = false,
  canEdit,
  edit,
  run,
}: {
  state: CollectionState
  appointments: CollectionState
  account: UserProfile
  canEditRecords?: boolean
  canEdit: boolean
  edit: (record: SmartCutRecord) => void
  run: Action
}) {
  const [search, setSearch] = useState("")
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null)
  const rows = state.records.map((record) => ({
    id: record.id,
    name: String(record.name || record.rows?.[0] || ""),
    email: String(record.email || record.rows?.[1] || ""),
    phone: String(record.phone || ""),
    notes: String(record.notes || record.rows?.[2] || ""),
    customerId: String(record.customerId || ""),
  }))
  const filtered = rows.filter((record) =>
    `${record.name} ${record.email} ${record.phone}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const historyCustomer = rows.find((record) => record.id === historyCustomerId)
  // Match account identity, not names: two customers can share a name.
  // Appointments are already subscribed within the current shop only.
  const history = historyCustomer?.customerId
    ? appointments.records
        .filter((booking) => booking.customerId === historyCustomer.customerId)
        .sort((a, b) =>
          `${String(b.date || "")} ${String(b.time || "")}`.localeCompare(
            `${String(a.date || "")} ${String(a.time || "")}`,
          ),
        )
    : []
  const completedServices = history.filter((booking) =>
    ["Completed", "Rated"].includes(appointmentStatus(booking.status)),
  )
  return (
    <>
      <PageHead
        title="Customer relationships"
        description="View customer details, bookings, and service history for this shop."
      >
        {rows.length > 0 && (
          <Button
            variant="secondary"
            icon={ArrowDownToLine}
            disabled={state.status !== "connected"}
            onClick={() =>
              download(
                "customers",
                ["Name", "Email", "Phone", "Notes", "Account type"],
                filtered.map((record) => [
                  record.name,
                  record.email,
                  record.phone,
                  record.notes,
                  record.customerId ? "Linked account" : "Studio record",
                ]),
              )
            }
          >
            Export
          </Button>
        )}
      </PageHead>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Search size={15} className="text-muted-foreground" />
          <input
            aria-label="Search customers"
            placeholder="Search customers…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full text-xs"
          />
        </div>
        <DataBoundary state={state}>
          {filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-secondary text-xs font-bold text-primary">
                    {initials(record.name)}
                  </span>
                  <div className="min-w-40 flex-1">
                    <p className="text-xs font-semibold">{record.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[record.email, record.phone]
                        .filter(Boolean)
                        .join(" · ") || "No contact details recorded"}
                    </p>
                  </div>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    {record.notes}
                  </p>
                  <Badge>
                    {record.customerId ? "Linked account" : "Studio record"}
                  </Badge>
                  {isManager(account.role) && record.customerId && (
                    <Button
                      variant="secondary"
                      icon={CalendarDays}
                      aria-label={`View booking and service history for ${record.name}`}
                      onClick={() => setHistoryCustomerId(record.id)}
                    >
                      Booking history
                    </Button>
                  )}
                  {canEdit && (!record.customerId || account.role === "Administrator" || record.customerId === account.uid) && (
                    <Button
                      variant="secondary"
                      aria-label={`Edit customer ${record.name}`}
                      onClick={() => edit(record)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={Users}
              title="No customers found"
              description="Customers appear automatically when they register and connect with this shop."
            />
          )}
        </DataBoundary>
      </div>
      {historyCustomer && isManager(account.role) && (
        <Modal
          title={`${historyCustomer.name} · Booking history`}
          subtitle="Read-only booking and service records from this shop only. All times are Asia/Manila."
          close={() => setHistoryCustomerId(null)}
        >
          <DataBoundary state={appointments}>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Bookings" value={String(history.length)} note="All appointment statuses" icon={CalendarDays} />
                <Metric label="Completed services" value={String(completedServices.length)} note="Completed and rated visits" icon={Scissors} />
                <Metric label="Service value" value={peso(completedServices.reduce((total, booking) => total + bookingAmount(booking), 0))} note="Completed services, not payment totals" icon={Wallet} />
              </div>
              {history.length ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {history.map((booking) => (
                    <div key={booking.id} className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{String(booking.service || "Service")}</span>
                        <Badge>{appointmentStatus(booking.status)}</Badge>
                      </div>
                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <span className="flex items-center gap-2"><CalendarDays size={14} />{String(booking.date || "Date not recorded")} · {formatTime12(booking.time, "Time not recorded")}</span>
                        <span className="flex items-center gap-2"><Scissors size={14} />{String(booking.provider || "Provider not recorded")}</span>
                        <span className="font-semibold text-foreground">{peso(bookingAmount(booking))}</span>
                        {!!booking.durationMinutes && <span>{String(booking.durationMinutes)} minutes</span>}
                      </div>
                      {!!booking.notes && <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs text-muted-foreground">{String(booking.notes)}</div>}
                      {!!booking.rejectionReason && <div className="text-xs text-muted-foreground">Rejection reason: {String(booking.rejectionReason)}</div>}
                      {canEditRecords && <RecordDeleteButton record={booking} collectionName="appointments" run={run} disabled={appointments.status !== "connected"} />}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon={CalendarDays} title="No bookings in this shop yet" description="This customer’s bookings and completed services will appear here when they book in this shop." />
              )}
            </div>
          </DataBoundary>
        </Modal>
      )}
    </>
  )
}
function Team({
  users,
  state,
  providers,
  account,
  busy,
  run,
  created,
}: {
  users: TeamAccount[]
  state: CollectionState
  providers: SmartCutRecord[]
  account: UserProfile
  busy: boolean
  run: Action
  created: (message?: string) => void
}) {
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editingName, setEditingName] = useState<TeamAccount | null>(null)
  const [memberName, setMemberName] = useState("")
  const [nameError, setNameError] = useState("")
  const canAssignRoles = account.role === "Administrator"
  const [pending, setPending] = useState<{
    user: TeamAccount
    role: UserRole
  } | null>(null)
  const filtered = users.filter((user) =>
    `${user.name} ${user.email} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <>
      <PageHead
        title="People behind the business"
        description={
          canAssignRoles
            ? "Manage this shop’s managers and staff. Customers are listed separately in Customers."
            : "View this shop’s managers and staff, or create staff logins. Customers are listed separately in Customers."
        }
      >
        <div className="flex flex-wrap gap-2">
        <Button
          icon={Plus}
          disabled={busy || state.status !== "connected"}
          onClick={() => setCreateOpen(true)}
        >
          {canAssignRoles ? "Create team account" : "Create Staff Account"}
        </Button>
        </div>
      </PageHead>
      <div className="mb-4 flex gap-2 rounded-lg border border-primary/15 bg-secondary/50 p-3 text-xs leading-relaxed text-primary">
        <ShieldCheck className="shrink-0" size={16} />
        {canAssignRoles
          ? "Create a login with a name, email, password, and role."
          : "Create Service Provider logins with a name, email, and password. Only an Administrator can change assigned roles."}{" "}
        Service Providers are automatically published in the booking directory.
        Passwords are never stored in Firestore, and your management session
        stays signed in.
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Search size={15} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search team"
            placeholder="Search name, email, role…"
            className="w-full text-xs"
          />
        </div>
        <DataBoundary state={state}>
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-background text-[14px] text-muted-foreground">
                  <tr>
                    {[
                      "Account",
                      "Email",
                      "Assigned role",
                      "Booking directory",
                    ].map((label) => (
                      <th className="px-4 py-3 font-medium" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr className="border-t border-border" key={user.uid}>
                      <td className="px-4 py-3 font-semibold">
                        {user.name}
                        {canAssignRoles && <Button variant="ghost" disabled={busy} onClick={() => { setEditingName(user); setMemberName(user.name); setNameError("") }}>Edit name</Button>}
                        {user.uid === account.uid && (
                          <span className="ml-2 text-[14px] text-muted-foreground">
                            You
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        {canAssignRoles ? (
                          <select
                            aria-label={`Role for ${user.name}`}
                            disabled={busy || user.uid === account.uid}
                            className="rounded-md border border-border bg-card p-2 disabled:opacity-50"
                            value={user.role}
                            onChange={(event) =>
                              setPending({
                                user,
                                role: event.target.value as UserRole,
                              })
                            }
                          >
                            {!roles.some((role) => role === user.role) && (
                              <option value={user.role} disabled>
                                {user.role || "Unknown role"} — migration
                                required
                              </option>
                            )}
                            {roles.map((role) => (
                              <option key={role}>{role}</option>
                            ))}
                          </select>
                        ) : (
                          <Badge>{user.role || "Unknown role"}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.role === "Service Provider" ? (
                          providers.some((record) => record.id === user.uid) ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Button
                              disabled={busy}
                              variant="secondary"
                              onClick={() =>
                                void run(
                                  () => publishServiceProvider(user.uid),
                                  "Provider added to the booking directory.",
                                )
                              }
                            >
                              Publish provider
                            </Button>
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={Users}
              title="No matching team members"
              description="Only managers and staff assigned to this shop appear here. Customer accounts are listed in Customers."
            />
          )}
        </DataBoundary>
      </div>
      {createOpen && (
        <TeamAccountModal
          canAssignRoles={canAssignRoles}
          close={() => setCreateOpen(false)}
          saved={() => {
            setSearch("")
            created()
          }}
        />
      )}
      {editingName && <Modal title="Edit member name" close={() => setEditingName(null)} busy={busy}>
        <div className="grid gap-4 p-5">
          <Field label="Account display name" hint="Updates the profile and this shop's directory. Historical bookings and receipts retain their recorded names.">
            <input className={inputClass} minLength={2} maxLength={120} value={memberName} disabled={busy} onChange={(event) => setMemberName(event.target.value)} />
          </Field>
          {nameError && <ErrorBox message={nameError} />}
          <Button disabled={busy || memberName.trim().length < 2} onClick={() => void run(async () => {
            try { await updateTeamMemberName(editingName.uid, memberName); setEditingName(null) }
            catch (failure) { setNameError(friendlyError(failure)); throw failure }
          }, "Member name updated.")}>Save name</Button>
        </div>
      </Modal>}
      {pending && canAssignRoles && (
        <Modal
          title="Change workspace access?"
          close={() => setPending(null)}
          busy={busy}
        >
          <div className="p-5">
            <p className="text-sm">
              {pending.user.name}: {pending.user.role} →{" "}
              <strong>{pending.role}</strong>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              This immediately changes their accessible modules and data
              permissions. Service Providers cannot create appointments.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => setPending(null)}
              >
                Keep current role
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await updateUserRole(pending.user.uid, pending.role)
                    setPending(null)
                  }, "Account permissions updated.")
                }
              >
                Confirm change
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}


function TeamAccountModal({
  close,
  saved,
  canAssignRoles,
}: {
  close: () => void
  saved: () => void
  canAssignRoles: boolean
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "Service Provider" as TeamRole,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <Modal
      title={canAssignRoles ? "Create team account" : "Create Staff Account"}
      subtitle="Give your staff member a login for this shop. Complete the details below."
      close={close}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setError("")
          if (form.password !== form.confirm) {
            setError("The passwords do not match.")
            return
          }
          setBusy(true)
          try {
            await createTeamAccount({
              ...form,
              role: canAssignRoles ? form.role : "Service Provider",
            })
            setForm({
              name: "",
              email: "",
              password: "",
              confirm: "",
              role: "Service Provider",
            })
            saved()
            close()
          } catch (failure) {
            setError(friendlyError(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 p-5">
          <Field label="Full name" hint="Use the staff member’s name as it should appear on appointments.">
            <input
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              placeholder="e.g. Juan Dela Cruz"
              className={inputClass}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label="Email address" hint="Use a unique email address. The staff member will use it to sign in.">
            <input
              required
              type="email"
              maxLength={254}
              autoComplete="off"
              placeholder="e.g. juan@example.com"
              className={inputClass}
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </Field>
          <Field
            label="Assigned role"
            hint={canAssignRoles
              ? "Choose the access this account needs."
              : "Managers can create Service Provider staff only. Only an Administrator can assign management roles."}
          >
            {canAssignRoles ? (
              <select
                required
                className={inputClass}
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value as TeamRole })
                }
              >
                {teamRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ) : (
              <input readOnly className={`${inputClass} bg-secondary text-primary`} value="Service Provider" />
            )}
          </Field>
          <Field
            label="Initial password"
            hint="At least 8 characters; your Firebase password policy also applies. Share securely with the team member."
          >
            <input
              required
              type="password"
              minLength={8}
              maxLength={4096}
              autoComplete="new-password"
              placeholder="Create a password (8+ characters)"
              className={inputClass}
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
            />
          </Field>
          <Field label="Confirm password" hint="Enter the same password again to avoid typing mistakes.">
            <input
              required
              type="password"
              minLength={8}
              maxLength={4096}
              autoComplete="new-password"
              placeholder="Re-enter the initial password"
              className={inputClass}
              value={form.confirm}
              onChange={(event) =>
                setForm({ ...form, confirm: event.target.value })
              }
            />
          </Field>
          <p className="rounded-lg bg-secondary/50 p-3 text-xs leading-relaxed text-primary">
            {!canAssignRoles || form.role === "Service Provider"
              ? "Can add services, manage assigned appointments and customers, and handle checkout. Cannot create appointments or access management tools."
              : form.role === "Manager"
                ? "Management access including payroll, analytics, and business settings. Can create Service Provider accounts, but cannot change assigned roles."
                : "Full management access, including team roles, payroll, analytics, and business settings."}{" "}
                The member can change their password or request a reset email
                in Settings → Security.
          </p>
          {error && <ErrorBox message={error} />}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} icon={Plus}>
            {busy ? "Creating account…" : canAssignRoles ? "Create account" : "Create Staff Account"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Finance({
  page,
  state,
  appointments,
  appointmentsStatus,
  canCheckout,
  checkout,
  admin = false,
  canEditRecords = false,
  run,
}: {
  page: "Payments"
  state: CollectionState
  appointments: SmartCutRecord[]
  appointmentsStatus: SyncState
  canCheckout: boolean
  checkout: (record: SmartCutRecord) => void
  admin?: boolean
  canEditRecords?: boolean
  run: Action
}) {
  const isSales = canCheckout
  const financialAmount = (record: SmartCutRecord) =>
    amountOf(record, 4)
  const financialMethod = (record: SmartCutRecord) =>
    String(
      record.method || record.rows?.[3] || "Legacy",
    )
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("All")
  const [dateStart, setDateStart] = useState("")
  const [dateEnd, setDateEnd] = useState("")
  const datedRecords = isSales ? financeRange(state.records, dateStart, dateEnd) : state.records
  const recordType = (record: SmartCutRecord) => record.type === "Walk-in" ? "Walk-in" : "Booking"
  const due = appointments.filter(awaitingPayment).filter((record) => !isSales || ((!dateStart || String(record.date) >= dateStart) && (!dateEnd || String(record.date) <= dateEnd)))
  const filtered = datedRecords.filter((record) =>
    (typeFilter === "All" || recordType(record) === typeFilter) &&
    `${record.client || record.rows?.[1]} ${record.service || record.rows?.[2]} ${record.provider || record.rows?.[3]} ${financialMethod(record)} ${record.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  ).sort((a, b) => financeDate(b).localeCompare(financeDate(a)) || adminRecordTime(b).localeCompare(adminRecordTime(a)) || a.id.localeCompare(b.id))
  const total = datedRecords.reduce(
    (sum, record) => sum + financialAmount(record),
    0,
  )
  const average = datedRecords.length ? total / datedRecords.length : 0
  const exportRows = filtered.map((record) => [
    record.id,
    isSales ? financeDate(record) : recordDate(record),
    recordType(record),
    String(record.client || record.rows?.[1] || ""),
    String(record.service || record.rows?.[2] || ""),
    peso(financialAmount(record)),
    String(record.provider || "Not recorded"),
    financialMethod(record),
    String(record.status || "Legacy record"),
    formatTime12(adminRecordTime(record), ""),
  ])
  return (
    <>
      <PageHead
        title={isSales ? "Sales & Payments" : "Your payments"}
        description={
          isSales
            ? "Collect completed services, review revenue and payment methods, and download receipts in one place."
            : "Collect completed appointments, review payment methods, and download customer receipts."
        }
      >
        {filtered.length > 0 && (
          <Button
            variant="secondary"
            icon={ArrowDownToLine}
            disabled={state.status !== "connected"}
            onClick={() =>
              download(
                page.toLowerCase(),
                [
                  "Transaction ID",
                  "Recorded date",
                  "Type",
                  "Client",
                  "Service",
                  "PHP",
                  "Provider",
                  "Method",
                  "Status",
                  "Recorded time (Asia/Manila)",
                ],
                exportRows,
                [
                  ["Summary scope", isSales ? `Payment dates: ${dateStart || "All"} — ${dateEnd || "All"}; the table also follows search and type filters.` : "All loaded transactions; the table follows the current search and type filters."],
                  [isSales ? "Gross sales" : "Payments received", peso(total)],
                  ["Transactions", String(datedRecords.length)],
                  ...(isSales ? [["Average sale", peso(average)]] : []),
                  ["Awaiting collection", appointmentsStatus === "connected"
                    ? peso(due.reduce((sum, record) => sum + bookingAmount(record), 0)) : "—"],
                ],
              )
            }
          >
            {isSales ? "Export transactions" : "Export payments"}
          </Button>
        )}
      </PageHead>
      {isSales && <SalesDateFilter start={dateStart} end={dateEnd} change={(start, end) => { setDateStart(start); setDateEnd(end) }} />}
      {isSales ? (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric
            label="Gross sales"
            value={state.status === "connected" ? peso(total) : "—"}
            note="Paid services recorded as revenue"
            icon={TrendingUp}
          />
          <Metric
            label="Transactions"
            value={
              state.status === "connected" ? String(datedRecords.length) : "—"
            }
            note="Confirmed Booking and Walk-in payments"
            icon={CreditCard}
          />
          <Metric
            label="Average sale"
            value={state.status === "connected" ? peso(average) : "—"}
            note="Gross sales per transaction"
            icon={Wallet}
          />
          <Metric
            label="Awaiting collection"
            value={appointmentsStatus === "connected" ? peso(due.reduce((sum, record) => sum + bookingAmount(record), 0)) : "—"}
            note={`${due.length} completed appointments`}
            icon={Clock3}
          />
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Metric
            label="Payments received"
            value={state.status === "connected" ? peso(total) : "—"}
            note={`${state.records.length} verified receipt records`}
            icon={CreditCard}
          />
          <Metric
            label="Awaiting collection"
            value={
              appointmentsStatus === "connected"
                ? peso(
                    due.reduce((sum, record) => sum + bookingAmount(record), 0),
                  )
                : "—"
            }
            note={`${due.length} completed appointments`}
            icon={Clock3}
          />
        </div>
      )}
      {isSales && <ProviderEarningsSummary state={{ ...state, records: datedRecords }} />}
      {due.length > 0 && canCheckout && (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-3">
            <h2 className="text-xs font-semibold">Ready for payment</h2>
            <p className="mt-1 text-[14px] text-amber-900/70">
              Record payment only after the service is completed and funds are
              received.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {due.map((record) => (
              <Button
                variant="secondary"
                icon={CreditCard}
                key={record.id}
                onClick={() => checkout(record)}
              >
                {bookingClient(record)} · {peso(bookingAmount(record))}
              </Button>
            ))}
          </div>
        </section>
      )}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Search size={15} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search financial records"
            placeholder={
              isSales
                ? "Search client, service, provider, method, receipt…"
                : "Search client, service, method, receipt…"
            }
            className="min-w-40 flex-1 text-xs"
          />
          <div className="flex gap-1" role="group" aria-label="Filter sales type">
            {["All", "Booking", "Walk-in"].map((type) => <Button key={type} variant={typeFilter === type ? "primary" : "ghost"} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>{type}</Button>)}
          </div>
        </div>
        <DataBoundary state={state}>
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-left text-xs">
                <thead className="bg-background text-[14px] text-muted-foreground">
                  <tr>
                    {(isSales
                      ? [
                          "Transaction",
                          "Type",
                          "Client / service",
                          "Amount paid",
                          "Service Provider",
                          "Method",
                          "Status",
                          "Receipt",
                        ]
                      : [
                          "Receipt",
                          "Type",
                          "Client / service",
                          "Amount paid",
                          "Method",
                          "Status",
                          "Export",
                        ]
                    ).map((label) => (
                      <th className="px-4 py-3 font-medium" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record, index) => (
                    <tr key={record.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[14px]">
                          {record.id.slice(0, 10)}
                        </p>
                        <p className="mt-1 text-[14px] text-muted-foreground">
                          {(isSales ? financeDate(record) : recordDate(record)) || "Date unavailable"}
                        </p>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatTime12(adminRecordTime(record), "")}
                        </span>
                      </td>
                      <td className="px-4 py-3"><VisitTypeBadge type={recordType(record)} /></td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {String(record.client || record.rows?.[1] || "")}
                        </p>
                        <p className="mt-1 text-[14px] text-muted-foreground">
                          {String(record.service || record.rows?.[2] || "")}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {peso(financialAmount(record))}
                      </td>
                      <td className="px-4 py-3">
                        {isSales
                          ? String(
                              record.provider ||
                                "Not recorded",
                            )
                          : financialMethod(record)}
                      </td>
                      {isSales && <td className="px-4 py-3">{financialMethod(record)}</td>}
                      <td className="px-4 py-3">
                        <Badge>
                          {String(record.status || "Legacy record")}
                        </Badge>
                      </td>
                      {(
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            icon={ArrowDownToLine}
                            disabled={state.status !== "connected"}
                            aria-label={`Download receipt for ${record.client || record.id}`}
                            onClick={() =>
                              download(
                                `receipt-${record.id}`,
                                [
                                  "Receipt ID",
                                  "Recorded date",
                                  "Type",
                                  "Client",
                                  "Service",
                                  "PHP",
                                  "Provider",
                                  "Method",
                                  "Status",
                                  "Recorded time (Asia/Manila)",
                                ],
                                [exportRows[index]],
                              )
                            }
                          >
                            Receipt
                          </Button>
                          {canEditRecords && <RecordDeleteButton record={record} collectionName="payments" run={run} disabled={state.status !== "connected"} />}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={isSales ? TrendingUp : CreditCard}
              title={
                isSales ? "No sales recorded yet" : "No payments recorded yet"
              }
              description={
                isSales
                  ? "A sale appears automatically after a completed appointment is paid."
                  : canCheckout
                    ? "Completed appointments awaiting collection appear above. Record received funds to create a receipt."
                    : "Your recorded payments and downloadable receipts will appear here."
              }
            />
          )}
        </DataBoundary>
      </div>
    </>
  )
}
function Analytics({
  sales,
  bookings,
}: {
  sales: CollectionState
  bookings: CollectionState
}) {
  const [start, setStart] = useState("")
  const [end, setEnd] = useState(manilaDate())
  const transactions = sales.records.filter(
    (record) => recordDate(record) >= start && recordDate(record) <= end,
  )
  const visits = bookings.records.filter(
    (record) => String(record.date) >= start && String(record.date) <= end,
  )
  const total = transactions.reduce((sum, record) => sum + amountOf(record), 0)
  const providers = [
    ...new Set(
      transactions.map((record) => String(record.provider || "Not recorded")),
    ),
  ]
  const summary = [
    ["Collected revenue", peso(total)],
    ["Transactions", String(transactions.length)],
    ["Appointments", String(visits.length)],
    [
      "Completed",
      String(visits.filter((record) => ["Completed", "Rated"].includes(String(record.status))).length),
    ],
    [
      "Average transaction",
      peso(transactions.length ? total / transactions.length : 0),
    ],
  ]
  const providerRevenue = providers.map((provider) => [
    provider,
    peso(transactions.filter((record) => String(record.provider || "Not recorded") === provider)
      .reduce((sum, record) => sum + amountOf(record), 0)),
  ])
  const outcomes = ["Pending", "Accepted", "In Progress", "Completed", "Rated", "Rejected", "Cancelled"]
    .map((status) => [status, String(visits.filter((record) => appointmentStatus(record.status) === status).length)])
  return (
    <>
      <PageHead
        title="Business overview"
        description="A clear view of collected revenue, provider earnings, and appointment activity."
      >
        <Button
          disabled={
            sales.status !== "connected" || bookings.status !== "connected"
          }
          variant="secondary"
          icon={ArrowDownToLine}
          onClick={() =>
            download("analytics", ["Metric", "Value"], [
              ["From", start || "All time"],
              ["Through", end],
              ...summary,
              ...providerRevenue.map(([provider, amount]) => [`Provider revenue · ${provider}`, amount]),
              ...outcomes.map(([status, count]) => [`Appointment outcome · ${status}`, count]),
            ])
          }
        >
          Export report
        </Button>
      </PageHead>
      <section className="mb-5 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Analytics date range">
        <div className="grid items-center gap-4 lg:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-sm font-semibold">Report dates</span>
            <span className="text-sm text-muted-foreground">Choose a start and end date. Use the same date to view one day.</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Start date" hint="Leave blank to include earlier dates.">
          <FinanceInput
            type="date"
            max={end}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </Field>
        <Field label="End date" hint="This date is included in the report.">
          <FinanceInput
            type="date"
            min={start}
            value={end}
            required
            onChange={(event) => setEnd(event.target.value || manilaDate())}
          />
        </Field>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span role="status">Showing: {start || "All earlier dates"} to {end}</span>
          <span>Philippine time · totals update automatically</span>
        </div>
      </section>
      <DataBoundary state={sales}>
        <DataBoundary state={bookings}>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary
              .filter((_, index) => index !== 3)
              .map(([label, value]) => (
                <Metric
                  key={label}
                  label={label}
                  value={value}
                  note={label === "Collected revenue" ? "Received payments · PHP"
                    : label === "Transactions" ? "Recorded sales"
                    : label === "Appointments" ? "Bookings in this period"
                    : "Revenue per sale · PHP"}
                  icon={label === "Transactions" ? CreditCard : label === "Appointments" ? CalendarDays : label === "Average transaction" ? Wallet : TrendingUp}
                />
              ))}
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="analytics-provider-heading">
              <div className="grid gap-1 border-b border-border p-5">
                <span id="analytics-provider-heading" className="font-display text-base font-semibold">Service Provider revenue</span>
                <span className="text-sm text-muted-foreground">Collected payments attributed to each provider.</span>
              </div>
              <div className="p-5">
              {providers.length ? (
                <div className="grid gap-1">
                  <div className="flex justify-between gap-4 pb-2 text-xs text-muted-foreground">
                    <span>Service Provider</span><span>Collected · PHP</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto" role="list" aria-label="Provider revenue breakdown">
                {providerRevenue.map(([provider, amount]) => (
                  <div
                    key={provider}
                    role="listitem"
                    className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">{provider.slice(0, 1).toUpperCase()}</span>
                      <span className="break-words text-sm font-medium">{provider}</span>
                    </div>
                    <strong className="shrink-0 text-sm tabular-nums">
                      {amount}
                    </strong>
                  </div>
                ))}
                  </div>
                </div>
              ) : (
                <Empty
                  icon={TrendingUp}
                  title="No revenue in this range"
                  description="Try a wider date range or record your first appointment payment."
                />
              )}
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="analytics-outcomes-heading">
              <div className="grid gap-1 border-b border-border p-5">
                <span id="analytics-outcomes-heading" className="font-display text-base font-semibold">Appointment outcomes</span>
                <span className="text-sm text-muted-foreground">Booking counts by status for the selected dates.</span>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2">
              {outcomes.map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between gap-3 rounded-xl bg-background p-3 text-sm"
                >
                  <Badge>{status}</Badge>
                  <strong className="text-lg tabular-nums">
                    {count}
                  </strong>
                </div>
              ))}
              </div>
            </section>
          </div>
          <span className="mt-4 block text-xs leading-relaxed text-muted-foreground">Revenue reflects recorded payments, not the expected value of appointments. Amounts are shown in Philippine pesos.</span>
        </DataBoundary>
      </DataBoundary>
    </>
  )
}
function FinanceInput(props: React.ComponentProps<"input">) {
  return <input {...props} className={inputClass} />
}
function SalesDateFilter({ start, end, change, label = "Sales date filter" }: { start: string; end: string; change: (start: string, end: string) => void; label?: string }) {
  const [customOpen, setCustomOpen] = useState(false)
  const [useRange, setUseRange] = useState(false)
  const today = manilaDate()
  const yesterdayDate = new Date(`${today}T12:00:00+08:00`)
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
  const yesterday = manilaDate(yesterdayDate)
  const selectDay = (offset: number) => {
    const day = offset === 0 ? today : yesterday
    setCustomOpen(false)
    setUseRange(false)
    change(day, day)
  }
  const isDay = (day: string) => !customOpen && start === day && end === day
  const allDates = !start && !end && !customOpen
  const summary = !start && !end ? "All dates" : start === end
    ? start === today ? "Today" : start === yesterday ? "Yesterday" : start
    : `${start} to ${end}`
  return <section className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4" aria-label={label}>
    <div className="flex flex-wrap gap-2" role="group" aria-label={label === "Appointment dates" ? "Choose appointment dates" : "Choose sales dates"}>
      <Button variant={isDay(today) ? "primary" : "secondary"} aria-pressed={isDay(today)} onClick={() => selectDay(0)}>Today</Button>
      <Button variant={isDay(yesterday) ? "primary" : "secondary"} aria-pressed={isDay(yesterday)} onClick={() => selectDay(-1)}>Yesterday</Button>
      <Button variant={customOpen ? "primary" : "secondary"} aria-pressed={customOpen} onClick={() => {
        setCustomOpen(true)
        setUseRange(false)
        const day = start || today
        change(day, day)
      }}>Choose date</Button>
      <Button variant={allDates ? "primary" : "ghost"} aria-pressed={allDates} onClick={() => {
        setCustomOpen(false)
        setUseRange(false)
        change("", "")
      }}>All dates</Button>
    </div>
    {customOpen && <div className="flex flex-wrap items-end gap-3">
      <Field label={useRange ? "Start date" : "Date"}>
        <FinanceInput type="date" value={start} onChange={(event) => {
          const day = event.target.value
          if (day) change(day, useRange && end >= day ? end : day)
        }} />
      </Field>
      {useRange && <Field label="End date">
        <FinanceInput type="date" value={end} min={start} onChange={(event) => {
          const day = event.target.value
          if (day) change(start <= day ? start : day, day)
        }} />
      </Field>}
      <Button variant="ghost" aria-pressed={useRange} onClick={() => {
        setUseRange((value) => !value)
        if (useRange) change(start, start)
      }}>{useRange ? "Use one day" : "Use a date range"}</Button>
    </div>}
    <span className="text-xs text-muted-foreground" role="status">Showing: {summary} · Philippine time. Totals update automatically.</span>
  </section>
}
function ProviderEarningsSummary({ state }: { state: CollectionState }) {
  return <section className="mb-4 rounded-xl border border-border bg-card p-4" aria-label="Provider earnings">
    <div className="grid gap-3">
      <span className="text-sm font-medium">Service Provider earnings · selected payment dates</span>
      <DataBoundary state={state}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providerEarnings(state.records).map((provider) => <Metric key={provider.id || provider.name} label={provider.name} value={peso(provider.earnings)} note={`${provider.count} paid services`} icon={Wallet} />)}
        </div>
        {!state.records.length && <Empty icon={Wallet} title="No earnings for these dates" description="New recorded payments appear here automatically." />}
      </DataBoundary>
    </div>
  </section>
}
function PayrollDayFilter({ date, change, disabled }: { date: string; change: (date: string) => void; disabled: boolean }) {
  const today = manilaDate()
  const previous = new Date(`${today}T12:00:00+08:00`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  const yesterday = manilaDate(previous)
  return <div className="flex flex-wrap items-end gap-3">
    <Button disabled={disabled} variant={date === today ? "primary" : "secondary"} aria-pressed={date === today} onClick={() => change(today)}>Today</Button>
    <Button disabled={disabled} variant={date === yesterday ? "primary" : "secondary"} aria-pressed={date === yesterday} onClick={() => change(yesterday)}>Yesterday</Button>
    <Field label="Choose date"><FinanceInput type="date" required value={date} max={today} disabled={disabled} onChange={(event) => { if (event.target.value) change(event.target.value) }} /></Field>
    <span className="text-xs text-muted-foreground">Philippine time · earnings and statements follow this day.</span>
  </div>
}
function PayrollProviderSelect(props: React.ComponentProps<"select">) {
  return <select {...props} className={inputClass} />
}
function payrollProviderKey(record: SmartCutRecord) {
  return String(record.providerId || `legacy:${record.provider || record.rows?.[0] || "Legacy statement"}`)
}
function payrollRecordedAt(record: SmartCutRecord) {
  const stamp = record.createdAt as { toDate?: () => Date; seconds?: number } | undefined
  const date = stamp?.toDate?.() ?? (typeof stamp?.seconds === "number" ? new Date(stamp.seconds * 1000) : undefined)
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    : "Not recorded"
}
function PayrollCalculator({ finance, payroll, providers, date, changeDate, history }: {
  finance: CollectionState; payroll: CollectionState; providers: SmartCutRecord[]
  date: string; changeDate: (date: string) => void; history: (provider: string) => void
}) {
  const [rates, setRates] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const earnings = providerEarnings(financeRange(finance.records, date, date), providers)
  return <section className="mb-4 rounded-xl border border-border bg-card p-4" aria-label="Payroll percentage calculator">
    <div className="grid gap-3">
      <span className="text-sm font-medium">Daily percentage calculator</span>
      <PayrollDayFilter date={date} disabled={busy} change={(day) => { changeDate(day); setMessage("") }} />
      <DataBoundary state={finance}>
        <div className="mt-4 grid gap-3">
          {earnings.map((provider) => {
            const key = provider.id || `legacy:${provider.name}`
            const rate = rates[key] ?? "20"
            const pay = percentagePay(provider.earnings, rate)
            const eligible = providers.find((item) => item.id === provider.id)
            const overlap = payroll.records.some((record) => record.providerId === provider.id && String(record.start) <= date && String(record.end) >= date)
            return <div key={key} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
              <Metric label={provider.name} value={peso(provider.earnings)} note={`${provider.count} paid services`} icon={Wallet} />
              <Field label="Pay percentage (%)"><FinanceInput type="number" min={0} max={100} step="0.01" value={rate} disabled={busy} onChange={(event) => setRates((current) => ({ ...current, [key]: event.target.value }))} /></Field>
              <Metric label="Calculated pay" value={pay === undefined ? "—" : peso(pay)} note="Earnings × percentage" icon={Wallet} />
              <div className="grid gap-2"><Button disabled={busy || !date || date > manilaDate() || finance.status !== "connected" || payroll.status !== "connected" || !eligible || overlap || pay === undefined || provider.count === 0} onClick={async () => {
                if (busy || pay === undefined || !eligible) return
                setBusy(true)
                setMessage("")
                try {
                  const cents = Math.round(pay * 100)
                  await createPayrollStatement({ providerId: provider.id, provider: String(eligible.name), start: date, end: date, base: pay, net: pay, baseCents: cents, netCents: cents, status: "Recorded" })
                  setMessage(`${provider.name}: ${peso(pay)} recorded for ${date}. No funds transferred.`)
                } catch (failure) { setMessage(friendlyError(failure)) }
                finally { setBusy(false) }
              }}>{overlap ? "Already recorded" : !eligible ? "Provider unavailable" : busy ? "Saving…" : "Record calculated pay"}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => history(provider.id || `legacy:${provider.name}`)}>View payroll history</Button></div>
            </div>
          })}
          {!earnings.length && <Empty icon={Wallet} title="No provider earnings" description="Recorded sales for the selected date will appear automatically." />}
        </div>
      </DataBoundary>
      <span className="mt-3 block text-sm text-muted-foreground" role="status">{message || "Enter 0–100%. Pay is rounded to centavos. Recording creates a statement, not a transfer. Overlapping pay periods cannot be recorded twice."}</span>
    </div>
  </section>
}
function Payroll({
  state,
  finance = initialCollection,
  providers = [],
  role,
  add,
}: {
  state: CollectionState
  finance?: CollectionState
  providers?: SmartCutRecord[]
  role: UserRole
  add: () => void
}) {
  const canCreate = isManager(role)
  const [date, setDate] = useState(manilaDate())
  const [allStatements, setAllStatements] = useState(false)
  const [providerFilter, setProviderFilter] = useState("")
  const historyProviders = new Map<string, string>()
  for (const provider of providers) historyProviders.set(provider.id, String(provider.name))
  for (const record of state.records) {
    const key = payrollProviderKey(record)
    if (!historyProviders.has(key)) historyProviders.set(key, String(record.provider || record.rows?.[0] || "Legacy statement"))
  }
  const statements = canCreate ? state.records.filter((record) =>
    (!providerFilter || payrollProviderKey(record) === providerFilter) &&
    (allStatements || (record.start && record.end
      ? String(record.start) <= date && String(record.end) >= date
      : financeDate(record) === date)),
  ) : state.records
  const viewHistory = (provider: string) => { setProviderFilter(provider); setAllStatements(true) }
  return (
    <>
      <PageHead
        title={canCreate ? "Payroll & earnings" : "My payroll statements"}
        description={
          canCreate
            ? "Record base-pay statements for each provider and pay period. Recording payroll does not transfer funds."
            : "Review your recorded base-pay statements and download a copy for your records. A recorded statement is not confirmation of a bank or cash transfer."
        }
      >
        {canCreate && (
          <Button icon={Plus} onClick={add}>
            Create statement
          </Button>
        )}
      </PageHead>
      {canCreate && <PayrollCalculator finance={finance} payroll={state} providers={providers} date={date} changeDate={(day) => {
        setDate(day); setAllStatements(false)
      }} history={viewHistory} />}
      <div className="rounded-xl border border-border bg-card">
        {canCreate && <div className="grid gap-3 border-b border-border p-4">
          <span className="text-sm font-semibold">{allStatements ? "Payroll history · all dates" : `Payroll statements · ${date}`}</span>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Service Provider"><PayrollProviderSelect value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
              <option value="">All providers</option>
              {[...historyProviders].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </PayrollProviderSelect></Field>
            <Button variant={allStatements ? "primary" : "secondary"} onClick={() => setAllStatements((value) => !value)}>{allStatements ? "Back to selected day" : "View all recorded payroll"}</Button>
            {providerFilter && <Button variant="ghost" onClick={() => setProviderFilter("")}>Clear provider filter</Button>}
          </div>
          <span className="text-xs text-muted-foreground">{allStatements ? "All recorded payroll statements for the selected provider." : "Only pay periods covering the selected day are shown."} Recorded payroll is not confirmation that funds were transferred.</span>
        </div>}
        <DataBoundary state={state}>
          {statements.length ? (
            <div className={canCreate ? "max-h-96 overflow-auto" : "overflow-x-auto"}>
              <table className="w-full whitespace-nowrap text-left text-xs">
                <thead className="bg-background text-[14px] text-muted-foreground">
                  <tr>
                    {[
                      "Service Provider",
                      "Period",
                      "Base",
                      "Net pay",
                      "Status",
                      ...(canCreate ? ["Recorded at (Philippine time)"] : []),
                      "Statement",
                    ].map((label) => (
                      <th className="px-4 py-3 font-medium" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statements.map((record) => (
                    <tr key={record.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">
                        {String(
                          record.provider ||
                            record.rows?.[0] ||
                            "Legacy statement",
                        )}
                      </td>
                      <td className="px-4 py-3 text-[14px]">
                        {record.start
                          ? `${record.start} — ${record.end}`
                          : "Not recorded"}
                      </td>
                      {[
                        {
                          key: "base",
                          amount: numeric(record.base ?? record.rows?.[1]),
                        },
                        {
                          key: "net",
                          amount: numeric(
                            record.net ?? record.rows?.[5] ?? record.rows?.[1],
                          ),
                        },
                      ].map(({ key, amount }) => (
                        <td className="px-4 py-3 tabular-nums" key={key}>
                          {peso(amount)}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <Badge>{String(record.status || "Recorded")}</Badge>
                      </td>
                      {canCreate && <td className="px-4 py-3">{payrollRecordedAt(record)}</td>}
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          icon={ArrowDownToLine}
                          disabled={state.status !== "connected"}
                          onClick={() =>
                            download(
                              `payroll-${record.id}`,
                              ["Field", "Value"],
                              [
                                [
                                  "Provider",
                                  String(
                                    record.provider || record.rows?.[0] || "Legacy statement",
                                  ),
                                ],
                                [
                                  "Period",
                                  record.start ? `${record.start} — ${record.end}` : "Not recorded",
                                ],
                                [
                                  "Base",
                                  peso(numeric(record.base ?? record.rows?.[1])),
                                ],
                                [
                                  "Net",
                                  peso(numeric(
                                    record.net ??
                                      record.rows?.[5] ??
                                      record.rows?.[1] ??
                                      0,
                                  )),
                                ],
                                ["Status", String(record.status || "Recorded")],
                                ...(canCreate ? [["Recorded at (Asia/Manila)", payrollRecordedAt(record)]] : []),
                                ["Statement ID", record.id],
                              ],
                            )
                          }
                        >
                          Download
                        </Button>
                        {canCreate && <Button variant="ghost" onClick={() => viewHistory(payrollProviderKey(record))}>View history</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={Wallet}
              title={
                canCreate
                  ? "No payroll statements for this selection"
                  : "No payroll statements yet"
              }
              description={
                canCreate
                  ? "Choose another day or provider, or select View all recorded payroll to see earlier statements."
                  : "Statements created for your Service Provider account will appear here."
              }
            />
          )}
        </DataBoundary>
      </div>
    </>
  )
}
function AdminSubscriptionControls({ subscription, state }: { subscription?: SmartCutRecord; state: CollectionState }) {
  const [planId, setPlanId] = useState("professional")
  const [dueDate, setDueDate] = useState(manilaDate(addBillingMonth(new Date())))
  const [manualLocked, setManualLocked] = useState(false)
  const [reason, setReason] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const pending = useRef(false)
  useEffect(() => {
    if (dirty) return
    setPlanId(String(subscription?.planId || "professional"))
    const end = billingDeadline(subscription)
    setDueDate(manilaDate(end || addBillingMonth(new Date())))
    setManualLocked(subscription?.manualLocked === true)
    setReason(String(subscription?.lockReason || ""))
  }, [subscription, dirty])
  const save = async (extend = false) => {
    if (saving || pending.current || state.status !== "connected") return
    pending.current = true
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await manageShopSubscription(planId, dueDate, manualLocked, reason, extend)
      setDirty(false)
      setSuccess("Subscription saved. Access follows the due date and manual lock setting. The adjustment is recorded in the audit history.")
    } catch (failure) { setError(friendlyError(failure)) }
    finally { pending.current = false; setSaving(false) }
  }
  return <section className="mt-6 grid gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <PageHead title="Administrator subscription controls" description="Adjust this shop's plan or access. This does not record a payment or change approved receipts." />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Plan"><select className={inputClass} value={planId} disabled={saving} onChange={(event) => { setPlanId(event.target.value); setDirty(true) }}>
        {subscriptionPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      </select></Field>
      <Field label="Access through (Asia/Manila)"><input type="date" className={inputClass} required value={dueDate} disabled={saving} onChange={(event) => { setDueDate(event.target.value); setDirty(true) }} /></Field>
    </div>
    <div className="grid gap-3 rounded-xl border border-border bg-background p-4">
    <span className="text-sm font-semibold">Workspace access</span>
    <span className="text-sm text-muted-foreground">Use a manual lock only when the shop has requirements to complete. Save below to apply your changes.</span>
    <Button variant={manualLocked ? "danger" : "secondary"} aria-pressed={manualLocked} disabled={saving} onClick={() => { setManualLocked((value) => !value); setDirty(true) }}>
      {manualLocked ? "Workspace manually locked — click to clear the lock" : "Lock workspace for unmet requirements"}
    </Button>
    <Field label="Access reason / requirements" hint="Visible to shop members. Do not include private IDs or receipt details.">
      <textarea className={inputClass} maxLength={500} rows={2} value={reason} disabled={saving} onChange={(event) => { setReason(event.target.value); setDirty(true) }} />
    </Field>
    <span className="text-xs text-muted-foreground">Clearing a manual lock does not override an expired date. Extend access or choose a future date to reopen the shop.</span>
    </div>
    {error && <ErrorBox message={error} />}
    {success && <span role="status" className="text-sm text-primary">{success}</span>}
    <div className="flex flex-wrap gap-3 border-t border-border pt-4">
      <Button disabled={saving || state.status !== "connected"} onClick={() => void save()}>{saving ? "Saving…" : "Save subscription & access"}</Button>
      <Button variant="secondary" disabled={saving || state.status !== "connected"} onClick={() => void save(true)}>Extend one billing month</Button>
    </div>
  </section>
}

function Subscription({
  account,
  business,
  state,
  payments,
  requests,
  businessStatus = initialCollection,
  reconnect,
  events = { records: [], status: "connected" },
}: {
  account: UserProfile
  business: Record<string, unknown>
  state: CollectionState
  payments: CollectionState
  requests: CollectionState
  businessStatus?: CollectionState
  reconnect?: () => void
  events?: CollectionState
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const parameters = new URLSearchParams(location.search)
  const selectedPlan = subscriptionPlans.find(
    (plan) => plan.id === parameters.get("plan"),
  )
  const [checkoutPlan, setCheckoutPlan] = useState("")
  const [transactionReference, setTransactionReference] = useState("")
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState("")
  const [readingReceipt, setReadingReceipt] = useState(false)
  useEffect(() => {
    if (!receiptFile) { setReceiptPreview(""); return }
    const url = URL.createObjectURL(receiptFile)
    setReceiptPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [receiptFile])
  const readReceipt = async (file: File) => {
    setCheckoutError("")
    setCheckoutSuccess("")
    setTransactionReference("")
    setReceiptFile(null)
    setReadingReceipt(true)
    try {
      validateServiceImage(file)
      setReceiptFile(file)
      const reference = await readReceiptReference(file)
      setTransactionReference(reference)
    } catch (failure) { setCheckoutError(friendlyError(failure)) }
    finally { setReadingReceipt(false) }
  }
  const [checkoutError, setCheckoutError] = useState("")
  const [checkoutSuccess, setCheckoutSuccess] = useState("")
  const [subscriptionNow, setSubscriptionNow] = useState(() => Date.now())
  const subscription = state.records.find(
    (record) => record.id === "subscription",
  )
  const isTrial =
    subscription?.status === "Trial" ||
    (subscription?.status === "Expired" &&
      subscription?.paymentMethod === "Free trial")
  const billingStates = [state, requests, payments, businessStatus]
  const billingReady = billingStates.every((item) => item.status === "connected")
  const billingError = billingStates.find((item) => item.status === "error")?.error
  const trialEligible = billingReady && !subscription
  // Subscription fees go to SmartCut, not the salon's customer-payment wallet.
  const gcashNumber = String(import.meta.env.VITE_SMARTCUT_GCASH_NUMBER || "").trim()
  const gcashName = String(import.meta.env.VITE_SMARTCUT_GCASH_NAME || "").trim()
  const pendingRequests = requests.records.filter(
    (request) => request.status === "Pending",
  )
  const requestDate = (record: SmartCutRecord) => {
    const stamp = record.createdAt as { toDate?: () => Date } | undefined
    const date = stamp?.toDate?.()
    return date
      ? new Intl.DateTimeFormat("en-PH", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Manila",
          hour12: true,
        }).format(date)
      : "Awaiting timestamp"
  }
  const paymentDate = (record: SmartCutRecord) => {
    const stamp = record.paidAt as { toDate?: () => Date } | undefined
    const date = stamp?.toDate?.()
    return date
      ? new Intl.DateTimeFormat("en-PH", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Manila",
          hour12: true,
        }).format(date)
      : "Pending timestamp"
  }
  const renewalDate = subscriptionPeriodEnd(subscription)
  const expiresAt = renewalDate?.getTime()
  const trialExpired =
    isTrial && expiresAt !== undefined && expiresAt <= subscriptionNow
  const periodExpired = expiresAt !== undefined && expiresAt <= subscriptionNow
  useEffect(() => {
    setSubscriptionNow(Date.now())
    const timer = window.setInterval(() => setSubscriptionNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [isTrial, expiresAt])
  const choosePlan = (planId: string) => {
    setCheckoutError("")
    setCheckoutSuccess("")
    navigate(`/subscription?plan=${encodeURIComponent(planId)}`)
  }
  const startTrial = async () => {
    if (checkoutPlan || !billingReady) return
    setCheckoutPlan("starter-trial")
    setCheckoutError("")
    setCheckoutSuccess("")
    try {
      await activateStarterTrial()
      setCheckoutSuccess(
        "Your seven-day Starter trial is active. No payment is required. Continue with Starter for ₱99/month after the trial; there is no automatic charge.",
      )
    } catch (failure) {
      setCheckoutError(friendlyError(failure))
    } finally {
      setCheckoutPlan("")
    }
  }
  const submitPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!billingReady || !selectedPlan || checkoutPlan || readingReceipt || !receiptFile || !transactionReference) return
    setCheckoutPlan(selectedPlan.id)
    setCheckoutError("")
    setCheckoutSuccess("")
    try {
      const receipt = await uploadServiceImage(receiptFile)
      await submitSubscriptionPayment(selectedPlan.id, transactionReference, receipt)
      setTransactionReference("")
      setReceiptFile(null)
      setCheckoutSuccess(
        "Payment submitted. Your subscription will activate after an Administrator verifies the GCash transaction.",
      )
    } catch (failure) {
      setCheckoutError(friendlyError(failure))
    } finally {
      setCheckoutPlan("")
    }
  }
  const approve = async (requestId: string) => {
    if (checkoutPlan || !billingReady) return
    setCheckoutPlan(requestId)
    setCheckoutError("")
    try {
      const result = await approveSubscriptionPayment(requestId)
      setCheckoutSuccess(result.locked ? "Payment approved. The manual requirements lock remains until an Administrator clears it." : "Payment approved and the subscription is now active.")
    } catch (failure) {
      setCheckoutError(friendlyError(failure))
    } finally {
      setCheckoutPlan("")
    }
  }

  if (!billingReady) return <>
    <PageHead title="Subscription & billing" description="Confirming this shop's subscription and payment history with Firebase. No payment or plan change will be submitted until the live data is connected." />
    {billingError ? <ErrorBox message={billingError} /> : <span role="status" className="text-sm text-muted-foreground">Connecting subscription data…</span>}
    {reconnect && <Button variant="secondary" className="mt-4" onClick={reconnect}>Reconnect subscription data</Button>}
  </>

  if (selectedPlan) {
    const submitting = checkoutPlan === selectedPlan.id
    return (
      <>
        <Button
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => navigate("/subscription")}
          disabled={submitting}
          className="mb-4"
        >
          Back to plans
        </Button>
        <PageHead
          title="Pay with GCash"
          description="Pay once, upload your receipt, then wait for Administrator approval. There are no automatic charges."
        />
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-secondary/50 p-4">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary" />
          <div className="grid gap-1 text-sm">
            <span className="font-semibold">Your payment needs manual approval</span>
            <span className="text-muted-foreground">Uploading a receipt does not activate access immediately. An Administrator checks the transaction first.</span>
          </div>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            <span className="mb-4 block text-sm font-semibold text-primary">Step 1 · Send your payment</span>
            <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="text-[14px] font-semibold uppercase tracking-wider text-primary">
                  SmartCut {selectedPlan.name}
                </p>
                <p className="mt-2 font-display text-3xl font-bold tabular-nums">
                  {peso(selectedPlan.amount)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  One month · one-time manual payment
                </p>
              </div>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                <Crown size={21} />
              </span>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <a
                href={gcashPaymentImage}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the full GCash payment QR image in a new tab"
                className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-border bg-white p-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <img
                  src={gcashPaymentQr}
                  alt="SmartCut GCash payment QR code"
                  className="size-full object-contain"
                />
              </a>
              <div>
                <p className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Send payment to
                </p>
                <p className="mt-2 text-xl font-bold">
                  {gcashNumber || "Scan the SmartCut payment QR"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {gcashName || "Confirm the recipient shown in GCash before sending. This pays for SmartCut access, not salon services."}
                </p>
                <ol className="mt-5 grid gap-3 text-sm leading-relaxed text-muted-foreground">
                  <li>
                    <strong className="text-foreground">1.</strong> Send exactly{" "}
                    {peso(selectedPlan.amount)} using GCash.
                  </li>
                  <li>
                    <strong className="text-foreground">2.</strong> Save a clear
                    screenshot of your GCash receipt.
                  </li>
                  <li>
                    <strong className="text-foreground">3.</strong> Submit it
                    below for Administrator approval.
                  </li>
                </ol>
              </div>
            </div>
          </section>
          <form
            onSubmit={submitPayment}
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <span className="mb-3 block text-sm font-semibold text-primary">Step 2 · Upload proof</span>
            <p className="font-display text-xl font-bold">Submit payment</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Upload your receipt and we’ll read its reference number. An
              Administrator must verify the payment first.
            </p>
            <div className="mt-5 grid gap-4">
              <Field
                label="GCash receipt screenshot"
                hint="JPG, PNG, or WebP · up to 5 MB. Include the amount, recipient, date, and reference. Receipts are stored on Cloudinary; hide unrelated personal details."
              >
                <input
                  className={inputClass}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={readingReceipt || submitting}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ""
                    if (file) void readReceipt(file)
                  }}
                />
              </Field>
              {readingReceipt && <p role="status" className="mt-3 text-xs text-muted-foreground">Reading your receipt… This may take a moment.</p>}
              {receiptPreview && <img src={receiptPreview} alt="Selected GCash receipt" className="mt-4 max-h-80 w-full rounded-lg border border-border object-contain" />}
              {transactionReference && <div role="status" className="mt-3 rounded-lg bg-secondary p-3 text-xs text-primary"><p className="font-semibold">Detected reference: {transactionReference}</p><p className="mt-1">Check this against your screenshot before submitting. Receipt reading does not verify payment or activate your subscription.</p></div>}
              <Field label="GCash transaction reference" hint="If automatic reading fails, type the exact reference from your screenshot. An Administrator will verify it.">
                <input className={inputClass} required maxLength={40} value={transactionReference} disabled={submitting || readingReceipt} onChange={(event) => setTransactionReference(event.target.value.toUpperCase())} />
              </Field>
            </div>
            {checkoutError && (
              <div className="mt-4">
                <ErrorBox message={checkoutError} />
              </div>
            )}
            {checkoutSuccess && (
              <div
                role="status"
                className="mt-4 rounded-lg bg-secondary p-3 text-xs leading-relaxed text-primary"
              >
                {checkoutSuccess}
              </div>
            )}
            <Button
              type="submit"
              className="mt-5 w-full"
              disabled={
                submitting || readingReceipt || !receiptFile || !transactionReference || requests.status !== "connected"
              }
            >
              {submitting ? "Submitting…" : "Submit for verification"}
            </Button>
            <p className="mt-3 text-center text-[14px] leading-relaxed text-muted-foreground">
              Never share your GCash PIN or OTP. SmartCut only asks for the
              receipt reference.
            </p>
          </form>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Subscription & billing"
        description="Your plan, renewal date, and payment status—all in one place."
      />
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-card">
        <DataBoundary state={state}>
          {subscription ? (
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Crown size={24} /></span>
                  <div>
                    <p className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Current plan
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {String(subscription.plan || "Workspace subscription")}
                    </p>
                  </div>
                </div>
                <Badge>
                  {subscription.manualLocked === true ? "Locked" : periodExpired
                    ? "Expired"
                    : String(subscription.status || "Not verified")}
                </Badge>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-background p-4">
                  <p className="text-[14px] text-muted-foreground">
                    Subscription price
                  </p>
                  <p className="mt-2 text-lg font-semibold tabular-nums">
                    {isTrial
                      ? trialExpired
                        ? `Trial ended · ${peso(99)} / month`
                        : `Free for 7 days · then ${peso(99)}`
                      : peso(numeric(subscription.amount))}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-4">
                  <p className="text-[14px] text-muted-foreground">Billing</p>
                  <p className="mt-2 text-base font-semibold">
                    Monthly · GCash
                  </p>
                  <span className="mt-1 block text-xs text-muted-foreground">Pay manually in PHP · no auto-debit</span>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-[14px] text-muted-foreground">
                    {isTrial ? "Trial ends" : "Access through"}
                  </p>
                  <p className="mt-2 text-base font-semibold">
                    {renewalDate
                      ? new Intl.DateTimeFormat("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Manila",
                          hour12: true,
                        }).format(renewalDate)
                      : "Not provided"}
                  </p>
                  <span className="mt-1 block text-xs text-muted-foreground">Philippine time</span>
                </div>
              </div>
              {isTrial && (
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  {trialExpired
                    ? "Your free trial has ended. Choose a plan below to continue with a manually approved GCash payment."
                    : "Your trial is active for seven days from activation. No payment or Administrator approval is needed for the trial, and you will not be charged automatically."}
                </p>
              )}
            </div>
          ) : (
            <Empty
              icon={Crown}
              title="No active subscription yet"
              description="Start your one-time Starter trial or choose a plan and pay directly with GCash."
            />
          )}
        </DataBoundary>
      </section>
      <div className="mb-4 mt-6 grid gap-1">
        <span className="font-display text-lg font-bold">Choose or renew your plan</span>
        <span className="text-sm text-muted-foreground">Select a plan below. All prices are in Philippine pesos.</span>
      </div>
      <div className="mb-5 grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-3">
        {[["1", "Choose a plan", "Pick the option for your shop."], ["2", "Pay with GCash", "Send payment and upload your receipt."], ["3", "Wait for approval", "An Administrator verifies your payment."]].map(([step, title, detail]) => <div key={step} className="flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">{step}</span>
          <div className="grid gap-1"><span className="text-sm font-semibold">{title}</span><span className="text-xs leading-relaxed text-muted-foreground">{detail}</span></div>
        </div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {subscriptionPlans.map((plan) => {
          const current = subscription?.planId === plan.id
          return (
            <div
              key={plan.id}
              className={cx(
                "flex flex-col rounded-2xl border bg-card p-5 sm:p-6",
                current ? "border-primary bg-secondary/30" : plan.featured ? "border-primary/40 shadow-sm" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-base font-bold">{plan.name}</p>
                {current ? <Badge>Current plan</Badge> : plan.featured && (
                  <span className="rounded-md bg-secondary px-2 py-1 text-[14px] font-semibold text-primary">
                    Recommended
                  </span>
                )}
              </div>
              <p className="mt-5 text-3xl font-bold tabular-nums">
                {plan.trialDays > 0 && trialEligible
                  ? "Free for 7 days"
                  : peso(plan.amount)}
                <span className="text-xs font-normal text-muted-foreground">
                  {plan.trialDays > 0 && trialEligible
                    ? ` · then ${peso(plan.amount)} / month`
                    : " / month"}
                </span>
              </p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                {plan.description}
              </p>
              <Button
                className="mt-6 w-full"
                variant={plan.featured ? "primary" : "secondary"}
                disabled={!!checkoutPlan || state.status !== "connected"}
                onClick={() =>
                  plan.id === "starter" && trialEligible
                    ? void startTrial()
                    : choosePlan(plan.id)
                }
              >
                {checkoutPlan === "starter-trial" && plan.id === "starter"
                  ? "Starting trial…"
                  : current
                    ? isTrial
                      ? "Subscribe to Starter"
                      : "Renew this plan"
                    : plan.id === "starter" && trialEligible
                      ? "Start 7-day free trial"
                      : "Choose plan"}
              </Button>
              {plan.id === "starter" && trialEligible && (
                <Button
                  variant="ghost"
                  className="mt-2"
                  onClick={() => choosePlan(plan.id)}
                  disabled={!!checkoutPlan}
                >
                  Skip trial and pay {peso(plan.amount)}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {checkoutError && (
        <div className="mt-4">
          <ErrorBox message={checkoutError} />
        </div>
      )}
      {checkoutSuccess && (
        <div
          role="status"
          className="mt-4 rounded-lg bg-secondary p-3 text-xs text-primary"
        >
          {checkoutSuccess}
        </div>
      )}
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-base font-bold">Awaiting approval</span>
            <Badge>{pendingRequests.length} pending</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {account.role === "Administrator"
              ? "Verify the GCash receipt before approving. Approval activates one month of access."
              : "Pending submissions require approval from an Administrator."}
          </p>
        </div>
        <DataBoundary state={requests}>
          {pendingRequests.length ? (
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold">
                        {String(request.plan)} · {peso(numeric(request.amount))}
                      </p>
                      <Badge>Pending</Badge>
                    </div>
                    <p className="mt-1 text-[14px] text-muted-foreground">
                      {String(request.submittedByName)} · {requestDate(request)}
                    </p>
                    <p className="mt-1 font-mono text-[14px] text-foreground">
                      {String(request.transactionReference)}
                    </p>
                    {isServiceImageUrl(request.receiptUrl) && <a href={request.receiptUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-semibold text-primary underline">View receipt screenshot</a>}
                  </div>
                  {account.role === "Administrator" && (
                    <div className="flex flex-wrap gap-2"><Button
                      icon={Check}
                      onClick={() => void approve(request.id)}
                      disabled={!!checkoutPlan}
                    >
                      {checkoutPlan === request.id
                        ? "Approving…"
                        : "Approve payment"}
                    </Button>
                    <Button variant="danger" disabled={!!checkoutPlan} onClick={() => {
                      const reason = window.prompt("Reason for rejecting this receipt (visible to the shop):")
                      if (!reason) return
                      setCheckoutPlan(request.id)
                      setCheckoutError("")
                      void rejectSubscriptionPayment(request.id, reason).then(() => setCheckoutSuccess("Payment proof rejected. No subscription access was activated."))
                        .catch((failure) => setCheckoutError(friendlyError(failure))).finally(() => setCheckoutPlan(""))
                    }}>Reject proof</Button></div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={CheckCircle2}
              title="No payments awaiting review"
              description="New GCash references will appear here after they are submitted."
            />
          )}
        </DataBoundary>
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <p className="font-display text-base font-bold">
            Approved payment history
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            GCash payments verified by an Administrator.
          </p>
        </div>
        <DataBoundary state={payments}>
          {payments.records.length ? (
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {payments.records.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div>
                    <p className="text-xs font-semibold">
                      {String(payment.plan || "Subscription payment")}
                    </p>
                    <p className="mt-1 text-[14px] text-muted-foreground">
                      {paymentDate(payment)} · GCash
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">
                      {peso(numeric(payment.amount))}
                    </p>
                    <p className="mt-1 font-mono text-[14px] text-muted-foreground">
                      {String(payment.reference || payment.id)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={CreditCard}
              title="No approved subscription payments"
              description="Approved GCash payments will be saved here."
            />
          )}
        </DataBoundary>
      </section>
      </div>
      {account.role === "Administrator" && <AdminSubscriptionControls subscription={subscription} state={state} />}
      {account.role === "Administrator" && <section className="mt-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <PageHead title="Subscription audit history" description="Administrator adjustments and verified approvals for this selected shop." />
        <DataBoundary state={events}>
          {events.records.length ? <div className="grid max-h-72 gap-3 overflow-y-auto">{[...events.records].sort((a, b) =>
            ((b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0) -
            ((a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0)).map((event) => <div key={event.id} className="rounded-lg bg-muted p-3 text-sm">
            <span className="font-semibold">{String(event.action)} · {String(event.planId)}</span>
            <span className="mt-1 block text-muted-foreground">{requestDate(event)} · {event.manualLocked ? "Manually locked" : "No manual lock"} · {String(event.reason || "No access note")}</span>
          </div>)}</div> : <Empty icon={Clock3} title="No recorded adjustments" description="New administrator changes will appear here in real time." />}
        </DataBoundary>
      </section>}
    </>
  )
}

function ShopSmsSettings({ shop, run, busy }: {
  shop: ShopProfile
  run: Action
  busy: boolean
}) {
  const [number, setNumber] = useState("")
  const [savedNumber, setSavedNumber] = useState("")
  const [dirty, setDirty] = useState(false)
  const [state, setState] = useState<CollectionState>(initialCollection)
  useEffect(() => subscribeShopSmsSettings(shop.id, setSavedNumber, (status, error) =>
    setState({ records: [], status, error }),
  ), [shop.id])
  useEffect(() => {
    if (!dirty) setNumber(savedNumber)
  }, [savedNumber, dirty])
  return (
    <DataBoundary state={state}>
      <form className="grid gap-5" onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          await saveShopSmsNumber(shop.id, number)
          setDirty(false)
        }, "Shop SMS number saved.")
      }}>
        <PageHead title="Booking SMS alerts" description={`Customer bookings at ${shop.name} notify only this shop’s saved number. Other shops use their own numbers.`} />
        <Field label="SMS number" hint="Use 09XXXXXXXXX or +639XXXXXXXXX. Leave blank and save to disable alerts. New alerts begin after enabling; historical bookings are not sent.">
          <input
            type="tel"
            autoComplete="tel"
            className={inputClass}
            maxLength={30}
            disabled={busy || state.status !== "connected"}
            value={number}
            onChange={(event) => { setDirty(true); setNumber(event.target.value) }}
            placeholder="09XXXXXXXXX"
          />
        </Field>
        <div className="rounded-lg border border-border bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
          Managers and Administrators can change this number at any time. It is private to shop management, separate from the shop’s contact number. Alerts are processed every minute; queued bookings and carrier delivery may take longer. Changes apply to new send attempts, not alerts already sent. A PhilSMS charge means the gateway accepted the message, not that the phone received it. For missing messages, check PhilSMS delivery history and sender-ID approval for the recipient’s network before retrying. SMS requires the updated Cloudflare Worker, valid PhilSMS credentials, and available credits.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || state.status !== "connected"}>
            {busy ? "Saving…" : "Save SMS number"}
          </Button>
          <Badge>{savedNumber ? `${shop.name} · ending ${savedNumber.slice(-4)}` : `${shop.name} · SMS disabled`}</Badge>
        </div>
      </form>
    </DataBoundary>
  )
}

function AccountSecuritySettings({ account, busy }: { account: UserProfile; busy: boolean }) {
  const [security, setSecurity] = useState<AccountSecurity | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [visible, setVisible] = useState(false)
  const [activity, setActivity] = useState<"password" | "email" | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const pending = useRef(false)
  const clearPasswords = () => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmation("")
    setVisible(false)
  }
  useEffect(() => {
    clearPasswords()
    setSecurity(null)
    setLoading(true)
    setError("")
    setSuccess("")
    return subscribeAccountSecurity((value) => {
      setSecurity(value?.uid === account.uid ? value : null)
      setLoading(false)
      if (!value || value.uid !== account.uid || !value.passwordEnabled) clearPasswords()
    }, (message) => {
      setSecurity(null)
      setLoading(false)
      clearPasswords()
      setError(message)
    })
  }, [account.uid])
  const disabled = busy || activity !== null
  const edit = (setter: (value: string) => void, value: string) => {
    setter(value)
    setError("")
    setSuccess("")
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (disabled || pending.current) return
    pending.current = true
    setActivity("password")
    setError("")
    setSuccess("")
    try {
      await changeOwnPassword(currentPassword, newPassword, confirmation)
      clearPasswords()
      setSuccess("Password updated successfully. Use your new password the next time you sign in. Other devices may need to sign in again.")
    } catch (failure) {
      setError(friendlyError(failure))
    } finally {
      pending.current = false
      setActivity(null)
    }
  }
  return <div className="grid max-w-xl gap-5">
    <PageHead title="Account security" description="Manage the password for your own signed-in account. Passwords are handled by Firebase Authentication, never saved in Firestore." />
    {loading ? <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle size={16} className="motion-safe:animate-spin" />Checking your sign-in method…</span> :
      security?.passwordEnabled ? <>
        <form className="grid gap-4" onSubmit={submit}>
          <PageHead title="Change password" description={`Verify your current SmartCut password for ${security.email}, then choose a new one. This does not change your Google password.`} />
          <fieldset disabled={disabled} className="grid gap-4">
            <Field label="Current password">
              <input name="currentPassword" type={visible ? "text" : "password"} required autoComplete="current-password" maxLength={4096} className={inputClass} value={currentPassword} onChange={(event) => edit(setCurrentPassword, event.target.value)} />
            </Field>
            <Field label="New password" hint="Choose a strong password. Firebase checks your account's password policy before saving.">
              <input name="newPassword" type={visible ? "text" : "password"} required autoComplete="new-password" maxLength={4096} className={inputClass} value={newPassword} onChange={(event) => edit(setNewPassword, event.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <input name="confirmPassword" type={visible ? "text" : "password"} required autoComplete="new-password" maxLength={4096} className={inputClass} value={confirmation} onChange={(event) => edit(setConfirmation, event.target.value)} />
            </Field>
            <Button variant="ghost" icon={visible ? EyeOff : Eye} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? "Hide passwords" : "Show passwords"}</Button>
          </fieldset>
          <Button type="submit" icon={ShieldCheck} disabled={disabled || !currentPassword || !newPassword || !confirmation}>{activity === "password" ? "Updating password…" : "Update password"}</Button>
        </form>
        <div className="grid gap-3 border-t border-border pt-4">
          <span className="text-sm font-semibold">Forgot your current password?</span>
          <span className="text-xs text-muted-foreground">Request a reset link for your signed-in account. Check your inbox and spam folder.</span>
          <Button variant="secondary" disabled={disabled} onClick={() => void (async () => {
            if (disabled || pending.current) return
            pending.current = true
            setActivity("email")
            setError("")
            setSuccess("")
            try {
              await requestOwnPasswordReset()
              clearPasswords()
              setSuccess("Password reset email requested. Check your inbox and spam folder.")
            } catch (failure) { setError(friendlyError(failure)) }
            finally { pending.current = false; setActivity(null) }
          })()}>{activity === "email" ? "Requesting reset link…" : "Send password reset email"}</Button>
        </div>
      </> : security ? <div className="grid gap-3 rounded-lg bg-muted p-4">
        <span className="text-sm font-semibold">{security.googleEnabled ? "You sign in with Google" : "Your sign-in provider manages your password"}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">This account does not have a SmartCut email/password login, so there is no current SmartCut password to verify. Change your password through your sign-in provider instead.</span>
        {security.googleEnabled && <Button variant="secondary" icon={ShieldCheck} onClick={() => window.open("https://myaccount.google.com/security", "_blank", "noopener,noreferrer")}>Open Google account security</Button>}
      </div> : <ErrorBox message={error || "Your sign-in session could not be verified. Sign in again before changing your password."} />}
    {error && security && <ErrorBox message={error} />}
    {success && <span role="status" className="flex items-start gap-2 rounded-lg bg-secondary p-4 text-sm text-primary"><CheckCircle2 size={18} className="shrink-0" />{success}</span>}
  </div>
}

function Settings({
  account,
  shop,
  workspace,
  run,
  busy,
}: {
  account: UserProfile
  shop: ShopProfile
  workspace: WorkspaceData
  run: Action
  busy: boolean
}) {
  const [tab, setTab] = useState(
    isManager(account.role) ? "Business" : "Account",
  )
  const [name, setName] = useState(account.name)
  const [shopPhoto, setShopPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [photoError, setPhotoError] = useState("")
  useEffect(() => {
    if (!shopPhoto) { setPhotoPreview(""); return }
    const url = URL.createObjectURL(shopPhoto)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [shopPhoto])
  const [form, setForm] = useState({
    shopType: "team" as ShopType,
    managerWorksAsBarber: false,
    barberAvailable: true,
    barberBio: "",
    barberPortfolio: "",
    facebookUrl: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    open: "09:00",
    close: "18:00",
    gcashName: "",
    gcashNumber: "",
    description: "",
    logoUrl: "",
    themeColor: "forest",
    active: true,
    acceptingCustomers: true,
  })
  const [formReady, setFormReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (dirty || workspace.businessStatus.status !== "connected") return
    setForm({
      shopType: workspace.business.shopType === "solo" ? "solo" : "team",
      managerWorksAsBarber: workspace.business.managerWorksAsBarber === true,
      barberAvailable: workspace.business.barberAvailable !== false,
      barberBio: String(workspace.business.barberBio || ""),
      barberPortfolio: String(workspace.business.barberPortfolio || ""),
      facebookUrl: String(workspace.business.facebookUrl || ""),
      name: String(workspace.business.name || shop.name),
      email: String(workspace.business.email || ""),
      phone: String(workspace.business.phone || ""),
      address: String(workspace.business.address || shop.location),
      open: String(workspace.business.open || "09:00"),
      close: String(workspace.business.close || "18:00"),
      gcashName: String(workspace.business.gcashName || ""),
      gcashNumber: String(workspace.business.gcashNumber || ""),
      description: String(workspace.business.description ?? shop.description),
      logoUrl: String(workspace.business.logoUrl ?? shop.logoUrl),
      themeColor: shop.themeColor || "forest",
      active: workspace.business.active === undefined ? shop.active : workspace.business.active !== false,
      acceptingCustomers: workspace.business.acceptingCustomers === undefined ? shop.acceptingCustomers : workspace.business.acceptingCustomers !== false,
    })
    setFormReady(true)
  }, [workspace.business, workspace.businessStatus.status, dirty, shop])
  const update = (key: keyof typeof form, value: string) => {
    setDirty(true)
    setForm((current) => ({ ...current, [key]: value }))
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !formReady || workspace.businessStatus.status !== "connected") return
    void run(async () => {
      const minute = (time: string) =>
        Number(time.split(":")[0]) * 60 + Number(time.split(":")[1])
      if (form.name.trim().length < 2 || form.open >= form.close)
        throw new Error(
          "Enter a business name and opening hours that end after they start.",
        )
      let logoUrl = form.logoUrl
      if (shopPhoto) {
        logoUrl = (await uploadServiceImage(shopPhoto)).imageUrl
        setForm((current) => ({ ...current, logoUrl }))
        setShopPhoto(null)
      }
      await saveBusinessSettings({
        ...form,
        logoUrl,
        name: form.name.trim(),
        openingMinute: minute(form.open),
        closingMinute: minute(form.close),
      })
      setDirty(false)
    }, "Business settings saved to Firestore.")
  }
  return (
    <>
      <PageHead
        title="Make it your workspace."
        description="Saved settings are shared through Firebase, not stored only on this device."
      />
      <div className="mb-4 flex gap-2">
        {[
          ...(isManager(account.role) ? ["Business", "SMS"] : []),
          "Account",
          "Security",
        ].map((item) => (
          <Button
            key={item}
            variant={item === tab ? "primary" : "secondary"}
            onClick={() => setTab(item)}
          >
            {item}
          </Button>
        ))}
      </div>
      <section className="w-full min-w-0 rounded-xl border border-border bg-card p-5">
        {tab === "Business" ? (
          <>
            {workspace.businessStatus.status === "connected" && workspace.business.bookingSchemaVersion !== 2 && (
              <p className="mb-4 rounded-lg bg-secondary p-3 text-sm text-primary">Confirm your opening and closing times below, then save to finish booking setup. The defaults are 9:00 AM–6:00 PM, Asia/Manila. Saving will check for active legacy appointments before enabling reservations.</p>
            )}
            {workspace.businessStatus.status === "error" && (
              <ErrorBox
                message={
                  workspace.businessStatus.error || "Unable to load settings."
                }
              />
            )}
            <form onSubmit={save} className="grid gap-5">
              <fieldset disabled={busy || !formReady || workspace.businessStatus.status !== "connected"} className="grid gap-5">
              <PageHead title="Your business model" description="Switching models requires finishing active bookings. Before going solo, deactivate other providers. Existing history and ratings are preserved." />
              <ShopTypeSelection value={form.shopType} change={(value) => { setDirty(true); setForm((current) => ({ ...current, shopType: value, managerWorksAsBarber: value === "solo" || current.managerWorksAsBarber })) }} />
              {form.shopType === "team" && <Button variant="secondary" aria-pressed={form.managerWorksAsBarber} onClick={() => { setDirty(true); setForm((current) => ({ ...current, managerWorksAsBarber: !current.managerWorksAsBarber })) }}>{form.managerWorksAsBarber ? "Manager also works as a barber" : "Enable my barber profile"}</Button>}
              {(form.shopType === "solo" || form.managerWorksAsBarber) && <div className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4">
                <PageHead title="My barber profile" description={`${account.name} · Same account, manager and service provider. Configure prices in Services; opening hours below define your working hours.`} />
                <Field label="About your work"><input className={inputClass} maxLength={1000} value={form.barberBio} onChange={(event) => update("barberBio", event.target.value)} /></Field>
                <Field label="Portfolio link"><input type="url" className={inputClass} value={form.barberPortfolio} onChange={(event) => update("barberPortfolio", event.target.value)} placeholder="https://" /></Field>
                <Button variant="secondary" aria-pressed={form.barberAvailable} onClick={() => { setDirty(true); setForm((current) => ({ ...current, barberAvailable: !current.barberAvailable })) }}>{form.barberAvailable ? "Available for new bookings" : "Unavailable for new bookings"}</Button>
              </div>}
              <div>
                <h2 className="text-sm font-semibold">Business details</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  These details are shared across your workspace.
                </p>
              </div>
              <fieldset
                disabled={
                  busy || workspace.businessStatus.status !== "connected"
                }
                className="grid gap-4 sm:grid-cols-2"
              >
                {(["name", "email", "phone", "address", "facebookUrl"] as const).map((key) => (
                  <Field
                    label={
                      {
                        name: "Business name",
                        email: "Contact email",
                        phone: "Phone number",
                        address: "Address",
                        facebookUrl: "Facebook page link",
                      }[key]
                    }
                    key={key}
                    hint={key === "facebookUrl" ? "Optional. Paste your Facebook page's HTTPS link; clear it to remove." : undefined}
                  >
                    <input
                      className={inputClass}
                      type={
                        key === "facebookUrl"
                          ? "url"
                          : key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                      }
                      minLength={key === "name" ? 2 : undefined}
                      required={key === "name"}
                      maxLength={key === "facebookUrl" ? 2000 : undefined}
                      value={form[key]}
                      onChange={(event) => update(key, event.target.value)}
                      placeholder={
                        {
                          name: "Your business name",
                          email: "hello@yourstudio.com",
                          phone: "+63 9XX XXX XXXX",
                          address: "Street, city, province",
                          facebookUrl: "https://www.facebook.com/yourshop",
                        }[key]
                      }
                    />
                  </Field>
                ))}
                {normalizeFacebookPageUrl(form.facebookUrl) && (
                  <Button
                    variant="secondary"
                    icon={ArrowUpRight}
                    onClick={() => {
                      const url = normalizeFacebookPageUrl(form.facebookUrl)
                      if (url) window.open(url, "_blank", "noopener,noreferrer")
                    }}
                  >
                    Open Facebook page
                  </Button>
                )}
                <div className="grid gap-4 border-t border-border pt-4 sm:col-span-2">
                  <div><h3 className="text-sm font-semibold">Shop selection & availability</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">These details appear on your public shop card. Pausing availability never deletes customer relationships or historical records.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Shop status"><select className={inputClass} value={form.active ? "active" : "inactive"} onChange={(event) => { setDirty(true); setForm((current) => ({ ...current, active: event.target.value === "active" })) }}><option value="active">Active — available for bookings</option><option value="inactive">Inactive — history remains accessible</option></select></Field>
                    <Field label="New customer connections"><select className={inputClass} value={form.acceptingCustomers ? "accepting" : "paused"} onChange={(event) => { setDirty(true); setForm((current) => ({ ...current, acceptingCustomers: event.target.value === "accepting" })) }}><option value="accepting">Accepting new customers</option><option value="paused">Existing customers only</option></select></Field>
                    <Field label="Shop description"><textarea maxLength={1000} rows={3} className={inputClass} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Tell customers what makes your shop special" /></Field>
                    <Field label="Shop picture" hint="Upload JPG, PNG, or WebP up to 5 MB. Save to publish your picture to customers.">
                      <div className="grid gap-3">
                        <ShopAvatar shop={{ ...shop, logoUrl: photoPreview || form.logoUrl }} large />
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload shop picture" className={inputClass} onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          try { validateServiceImage(file); setShopPhoto(file); setDirty(true); setPhotoError("") }
                          catch (failure) { setPhotoError(friendlyError(failure)); event.target.value = "" }
                        }} />
                        <input type="url" aria-label="Shop picture URL" className={inputClass} value={form.logoUrl} onChange={(event) => { setShopPhoto(null); update("logoUrl", event.target.value) }} placeholder="Or paste an HTTPS image URL" />
                        {(shopPhoto || form.logoUrl) && <Button variant="secondary" onClick={() => { setShopPhoto(null); update("logoUrl", "") }}>Remove picture</Button>}
                        {photoError && <ErrorBox message={photoError} />}
                      </div>
                    </Field>
                    <Field label="Shop color" hint="Changes this shop’s buttons, highlights, and sidebar for everyone visiting its workspace. SmartCut sign-in branding stays unchanged.">
                      <select className={inputClass} value={form.themeColor} onChange={(event) => update("themeColor", event.target.value)}>
                        <option value="forest">Forest green · SmartCut default</option>
                        <option value="ocean">Ocean blue</option>
                        <option value="plum">Plum purple</option>
                        <option value="bronze">Warm bronze</option>
                      </select>
                      <div data-shop-theme={form.themeColor} className="mt-3 rounded-lg border border-border bg-secondary p-3 text-primary"><span className="font-semibold">Your shop, your color</span><span className="mt-2 block rounded-lg bg-primary p-2 text-center text-white">Button preview</span></div>
                    </Field>
                  </div>
                </div>
                <div className="sm:col-span-2 border-t border-border pt-4">
                  <p className="text-sm font-semibold">Direct GCash payments</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The provided SmartCut payment QR is shown during
                    subscription checkout. Add the account details shown with
                    it for clarity.
                  </p>
                </div>
                <Field label="GCash account name">
                  <input
                    className={inputClass}
                    value={form.gcashName}
                    onChange={(event) =>
                      update("gcashName", event.target.value)
                    }
                    placeholder="Account holder name"
                  />
                </Field>
                <Field label="GCash mobile number">
                  <input
                    className={inputClass}
                    type="tel"
                    value={form.gcashNumber}
                    onChange={(event) =>
                      update("gcashNumber", event.target.value)
                    }
                    placeholder="09XX XXX XXXX"
                  />
                </Field>
                <Field
                  label="Opens at"
                  hint="Daily opening time. Published on your customer shop card."
                >
                  <TimePicker label="Opening time" value={form.open} change={(value) => update("open", value)} />
                </Field>
                <Field
                  label="Closes at"
                  hint="Published on your shop card. Services must finish before closing."
                >
                  <TimePicker label="Closing time" value={form.close} change={(value) => update("close", value)} />
                </Field>
                <Field label="Currency">
                  <input
                    className={inputClass}
                    disabled
                    value="PHP — Philippine Peso"
                    readOnly
                  />
                </Field>
                <Field label="Timezone">
                  <input
                    className={inputClass}
                    disabled
                    value="Asia/Manila (UTC+08:00)"
                    readOnly
                  />
                </Field>
              </fieldset>
              <div>
                <Button
                  type="submit"
                  disabled={
                    busy || workspace.businessStatus.status !== "connected"
                  }
                >
                  {busy ? "Saving…" : "Save business settings"}
                </Button>
              </div>
              </fieldset>
            </form>
          </>
        ) : tab === "SMS" && isManager(account.role) ? (
          <ShopSmsSettings key={shop.id} shop={shop} run={run} busy={busy} />
        ) : tab === "Account" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                () => updateAccountProfile(name),
                "Account name updated.",
              )
            }}
            className="grid gap-4"
          >
            <h2 className="text-sm font-semibold">Your account</h2>
            <Field
              label="Display name"
              hint="Use the name you want shown on your bookings."
            >
              <input
                required
                minLength={2}
                maxLength={120}
                disabled={busy}
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                disabled
                readOnly
                value={account.email}
              />
            </Field>
            <Field label="Assigned role">
              <input
                className={inputClass}
                disabled
                readOnly
                value={account.role}
              />
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                Save account
              </Button>
            </div>
          </form>
        ) : (
          <AccountSecuritySettings key={account.uid} account={account} busy={busy} />
        )}
      </section>
    </>
  )
}

function VisitTypeBadge({ type }: { type: "Booking" | "Walk-in" }) {
  const Icon = type === "Booking" ? CalendarDays : Store
  return <span className={cx(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold",
    type === "Booking" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-900",
  )}><Icon size={13} />{type}</span>
}

function ServiceVisitModal(props: React.ComponentProps<typeof BookingModal> & { walkInSaved: () => void }) {
  const [mode, setMode] = useState<"Booking" | "Walk-in">("Booking")
  const [modeBusy, setModeBusy] = useState(false)
  const tabs = isManager(props.account.role) ? (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Service visit type">
      {(["Booking", "Walk-in"] as const).map((item) =>
        <Button key={item} disabled={modeBusy} aria-pressed={mode === item} variant={mode === item ? (item === "Booking" ? "booking" : "walk-in") : "ghost"}
          icon={item === "Booking" ? CalendarDays : Store}
          className={cx(mode === item && "shadow-sm")}
          onClick={() => setMode(item)}>{item}</Button>)}
    </div>
  ) : null
  return mode === "Walk-in" && isManager(props.account.role)
    ? <WalkInForm services={props.services} providers={props.providers} business={props.business}
        selectedServiceId={props.selectedServiceId} tabs={tabs} close={props.close} saved={props.walkInSaved} onBusyChange={setModeBusy} />
    : <BookingModal {...props} tabs={tabs} onBusyChange={setModeBusy} />
}

type BookingClient = { id: string; name: string; email: string; customerId: string; contact: string }

function BookingCustomerPicker({ clients, value, select }: {
  clients: BookingClient[]; value: string; select: (client: BookingClient | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])
  const chosen = clients.find((client) => client.id === value)
  const matches = clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(search.toLowerCase()))
  return <div ref={container} className="relative grid gap-2">
    <span className="text-sm font-medium">Customer</span>
    <Button variant="secondary" aria-expanded={open} icon={ChevronDown}
      className="justify-between text-left" onClick={() => { setOpen(!open); setSearch("") }}>
      <span className="truncate">{chosen?.name || "Choose a saved customer"}</span>
    </Button>
    {open && <div className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-60 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
        <Search size={15} className="shrink-0 text-muted-foreground" />
        <input autoFocus aria-label="Search customers by name or email" className="min-w-0 flex-1 bg-transparent text-sm"
          placeholder="Search name or email…" value={search} onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault() }} />
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
        {matches.length ? matches.map((client) =>
          <Button key={client.id} variant="ghost" aria-pressed={value === client.id}
            className="w-full justify-start text-left" onClick={() => { select(client); setOpen(false) }}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{client.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{client.email || client.contact || "No email recorded"}</span>
            </span>{value === client.id && <Check size={14} className="shrink-0 text-primary" />}
          </Button>) : <div role="status" className="p-4 text-center text-sm text-muted-foreground">
            {clients.length ? "No customers match this search." : "No saved customers yet."}
          </div>}
      </div>
      <div className="sticky bottom-0 shrink-0 border-t border-border bg-card p-2">
        <Button variant="secondary" icon={Plus} className="w-full justify-start"
          onClick={() => { select(null); setOpen(false) }}>Add new client</Button>
      </div>
    </div>}
  </div>
}

function WalkInForm({ services, providers, business, selectedServiceId, tabs, close, saved, onBusyChange }: {
  services: Service[]; providers: SmartCutRecord[]; business: Record<string, unknown>
  selectedServiceId: string; tabs: ReactNode; close: () => void; saved: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState<"details" | "payment" | "success">("details")
  const [client, setClient] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [serviceIds, setServiceIds] = useState<string[]>(selectedServiceId ? [selectedServiceId] : [])
  const [providerId, setProviderId] = useState(business.shopType === "solo" ? String(business.managerProviderId || "") : "")
  useEffect(() => {
    if (business.shopType === "solo" && business.managerProviderId)
      setProviderId(String(business.managerProviderId))
  }, [business.shopType, business.managerProviderId])
  const [method, setMethod] = useState("Cash")
  const [received, setReceived] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [paidSummary, setPaidSummary] = useState<{ total: number; method: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])
  const active = services.filter((service) => service.status === "Active" && !service.legacy)
  const selected = active.filter((service) => serviceIds.includes(service.id))
  const total = selected.reduce((sum, service) => sum + Math.round(service.amount * 100), 0) / 100
  const activeProviders = providers.filter((provider) => provider.active === true && provider.role === "Service Provider" &&
    (business.shopType !== "solo" || provider.id === business.managerProviderId))
  const selectedProvider = activeProviders.find((provider) => provider.id === providerId)
  return <Modal title={step === "success" ? "Payment recorded" : "Book a Service"} subtitle="Walk-in · Immediate service, no reserved date or time" close={close} busy={busy}>
    <div className="p-5">
      {step === "details" && tabs}
      {step !== "success" ? <form className="mt-4 grid gap-4" onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setError("")
        if (client.trim().length < 2 || selected.length !== serviceIds.length || !selected.length) {
          setError("Enter a client name and choose one or more active services."); return
        }
        if (!selectedProvider) {
          setError("Choose a specific active service provider before continuing."); return
        }
        if (step === "details") { setStep("payment"); return }
        if (!confirmed) { setError("Confirm that you have received the payment."); return }
        if (method === "Cash" && (!received || moneyNumber(received) < total)) { setError("Cash received must cover the total."); return }
        setBusy(true)
        try {
          const receipt = await createPaidWalkIn(id, { client, email, phone, serviceIds, requestedProviderId: providerId, method, quotedTotal: total })
          setPaidSummary({ total: Number(receipt.amount), method: String(receipt.method) })
          setStep("success"); saved()
        } catch (failure) { setError(friendlyError(failure)) } finally { setBusy(false) }
      }}>
        <fieldset disabled={busy} className="grid gap-4">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <VisitTypeBadge type="Walk-in" /><span>{step === "details" ? "1. Client & services" : "2. Confirm received payment"}</span>
        </div>
        {step === "details" ? <>
          <Field label="Client name"><input className={inputClass} required minLength={2} maxLength={120} value={client} onChange={(event) => setClient(event.target.value)} placeholder="Client's full name" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email (optional)"><input className={inputClass} type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></Field>
            <Field label="Phone (optional)"><input className={inputClass} type="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09XXXXXXXXX" /></Field>
          </div>
          <Field label="Services" hint="Choose as many different active services as needed. Prices are checked again when recording payment.">
            <div className="grid max-h-60 gap-2 overflow-y-auto overscroll-contain" role="group" aria-label="Walk-in services">
              {active.map((service) => <Button key={service.id} variant={serviceIds.includes(service.id) ? "walk-in" : "secondary"} aria-pressed={serviceIds.includes(service.id)}
                className="justify-between text-left"
                onClick={() => setServiceIds((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])}>
                  <span className="min-w-0 truncate">{service.name}</span>
                  <span className="flex shrink-0 items-center gap-2">{peso(service.amount)}{serviceIds.includes(service.id) && <Check size={14} />}</span>
              </Button>)}
              {!active.length && <Empty icon={Scissors} title="No available services" description="Add an active service to the shop menu before creating a walk-in." />}
            </div>
          </Field>
          <Field label="Service provider" hint="Required. Select the specific provider who served this client so earnings go to the correct person.">
            <select className={inputClass} required value={providerId} disabled={business.shopType === "solo"} onChange={(event) => setProviderId(event.target.value)}>
              <option value="" disabled>Select a service provider</option>
              {activeProviders.map((provider) => <option key={provider.id} value={provider.id}>{String(provider.name)}</option>)}
            </select>
            {!activeProviders.length && <ErrorBox message="No active service provider is available. Ask management to activate a provider before recording a walk-in." />}
          </Field>
        </> : <>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-sm font-semibold">{client}</div>
            <div className="mt-1 text-xs text-muted-foreground">{String(selectedProvider?.name || "Provider no longer available — go Back and select a provider")} · No reservation</div>
            <div className="mt-4 grid gap-2">{selected.map((service) => <div key={service.id} className="flex justify-between gap-3 text-sm"><span>{service.name}</span><span className="tabular-nums">{peso(service.amount)}</span></div>)}</div>
          </div>
          <Field label="Payment method">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Walk-in payment method">
              {walkInPaymentMethods.map((item) => <Button key={item} variant="secondary" aria-pressed={method === item}
                className={cx(method === item && "border-primary bg-secondary text-primary")}
                onClick={() => { setMethod(item); setConfirmed(false) }}>{item}</Button>)}
            </div>
          </Field>
          {method === "Cash" && <Field label="Cash received (PHP)">
            <input className={inputClass} type="number" required min={total} step="0.01" value={received} onChange={(event) => setReceived(event.target.value)} />
            {!!received && Number(received) >= total && <span className="text-xs text-muted-foreground">Change: {peso(Number(received) - total)}</span>}
          </Field>}
          <div className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">This records payment already received. It does not charge a card or e-wallet.</div>
          <Button variant="secondary" role="checkbox" aria-checked={confirmed} icon={confirmed ? CheckCircle2 : CreditCard}
            onClick={() => setConfirmed(!confirmed)}>I confirm the payment has been received</Button>
        </>}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total</span><span className="font-display text-2xl font-bold tabular-nums">{peso(total)}</span>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => {
            if (step === "details") close()
            else { setConfirmed(false); setStep("details") }
          }}>{step === "details" ? "Cancel" : "Back"}</Button>
          <Button type="submit" variant="walk-in" icon={step === "details" ? ArrowRight : Check} className="flex-1"
            disabled={busy || !selected.length || !selectedProvider || (step === "payment" && !confirmed)}>
            {busy ? "Recording payment…" : step === "details" ? "Proceed to Payment" : "Confirm payment"}
          </Button>
        </div>
        </fieldset>
      </form> : <div className="grid gap-4 py-5 text-center">
        <CheckCircle2 size={42} className="mx-auto text-primary" />
        <span className="font-display text-xl font-bold">Payment successful</span>
        <span className="text-sm text-muted-foreground">{peso(paidSummary?.total ?? total)} recorded via {paidSummary?.method || method}. This walk-in is completed and saved in Sales and Payments.</span>
        <span className="text-xs text-muted-foreground">No reservation or additional acceptance, start, or completion steps are required.</span>
        <Button onClick={close}>Done</Button>
      </div>}
    </div>
  </Modal>
}

function BookingModal({
  selectedServiceId,
  account,
  services,
  providers,
  clients,
  bookingIssue,
  setup,
  business,
  close,
  saved,
  tabs,
  onBusyChange,
}: {
  selectedServiceId: string
  account: UserProfile
  services: Service[]
  providers: SmartCutRecord[]
  clients: SmartCutRecord[]
  bookingIssue: string
  setup?: () => void
  business: Record<string, unknown>
  close: () => void
  saved: () => void
  tabs?: ReactNode
  onBusyChange?: (busy: boolean) => void
}) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  const [error, setError] = useState("")
  const [selectedClientId, setSelectedClientId] = useState("")
  const [newClientEmail, setNewClientEmail] = useState("")
  const newClientNameInput = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState<BookingInput>({
    client: account.role === "Customer" ? account.name : "",
    customerId: account.role === "Customer" ? account.uid : "",
    serviceId: selectedServiceId,
    providerId: business.shopType === "solo" ? String(business.managerProviderId || "") : "",
    date: manilaDate(),
    time: String(business.open || "09:00"),
    notes: "",
  })
  useEffect(() => {
    if (business.shopType === "solo" && business.managerProviderId)
      setInput((current) => ({ ...current, providerId: String(business.managerProviderId) }))
  }, [business.shopType, business.managerProviderId])
  const active = services.filter(
    (service) => service.status === "Active" && !service.legacy,
  )
  const service = active.find((item) => item.id === input.serviceId)
  const provider = providers.find((item) => item.id === input.providerId)
  const suggestedTimes = useMemo(() => {
    if (!service || !input.date) return []
    const opening = Number(business.openingMinute)
    const closing = Number(business.closingMinute)
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return []
    const times: string[] = []
    for (let minute = Math.ceil(opening / 15) * 15; minute + service.durationMinutes <= closing; minute += 15) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
      if (new Date(`${input.date}T${time}:00+08:00`) > new Date()) times.push(time)
    }
    return times
  }, [service, input.date, business.openingMinute, business.closingMinute])
  const savedClients = clients
    .map((record) => ({
      id: record.id,
      name: String(record.name || record.rows?.[0] || "").trim(),
      customerId: String(record.customerId || ""),
      email: String(record.email || ""),
      contact: String(record.phone || record.email || ""),
    }))
    .filter((record) => record.name.length >= 2)
    .sort((first, second) => first.name.localeCompare(second.name))
  const update = (key: keyof BookingInput, value: string) =>
    setInput((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError("")
    if (step === 1) {
      if (!service || input.client.trim().length < 2) {
        setError("Enter a client name and select an active service.")
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      try {
        if (!service || (input.providerId && !provider) || !providers.length)
          throw new Error("No active provider is available for this selection.")
        bookingSlots(input.time, service.durationMinutes)
        if (new Date(`${input.date}T${input.time}:00+08:00`) <= new Date())
          throw new Error("Choose a future time in Asia/Manila.")
        if (
          input.time < String(business.open || "00:00") ||
          Number(input.time.split(":")[0]) * 60 +
            Number(input.time.split(":")[1]) +
            service.durationMinutes >
            Number(String(business.close || "23:59").split(":")[0]) * 60 +
              Number(String(business.close || "23:59").split(":")[1])
        )
          throw new Error("The service must fit within business hours.")
        setStep(3)
      } catch (failure) {
        setError(friendlyError(failure))
      }
      return
    }
    setBusy(true)
    try {
      if (isManager(account.role) && !selectedClientId) {
        const client = await createRecord("clients", {
          name: input.client.trim(), email: newClientEmail.trim(),
          phone: "", customerId: "", notes: "",
        })
        setSelectedClientId(client.id)
      }
      await createAppointment(input, providers.map((provider) => provider.id))
      saved()
      close()
    } catch (failure) {
      setError(friendlyError(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={
        account.role === "Customer" ? "Book your next visit" : "Book a Service"
      }
      subtitle={`Step ${step} of 3 · ${["Client & service", "Provider & time", "Review & reserve"][step - 1]}`}
      close={close}
      busy={busy}
    >
      {tabs && <div className="px-5 pt-4">{tabs}<div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">Booking · Reserve a future date and time. Payment is collected at the shop.</div></div>}
      <form onSubmit={submit}>
        <ol aria-label="Booking progress" className="grid grid-cols-3 gap-2 px-5 pt-4">
          {[1, 2, 3].map((item) => (
            <li
              key={item}
              aria-current={item === step ? "step" : undefined}
              className={cx(
                "border-t-2 pt-2 text-xs font-medium",
                item <= step ? "border-primary text-primary" : "border-border text-muted-foreground",
              )}
            >{item}. {["Service", "Date & time", "Confirm"][item - 1]}</li>
          ))}
        </ol>
        <fieldset disabled={busy} className="grid gap-4 p-5">
          {bookingIssue && (bookingIssue.startsWith("Loading ")
            ? <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle size={15} className="motion-safe:animate-spin" />{bookingIssue}</span>
            : <ErrorBox message={bookingIssue} />)}
          {bookingIssue && setup && <Button variant="secondary" onClick={setup}>Open Business Settings</Button>}
          {step === 1 && (
            <>
              {account.role !== "Customer" && <BookingCustomerPicker
                clients={savedClients} value={selectedClientId}
                select={(client) => {
                  setSelectedClientId(client?.id || "")
                  setNewClientEmail("")
                  setInput((current) => ({ ...current, client: client?.name || "", customerId: client?.customerId || "" }))
                  if (!client) window.requestAnimationFrame(() => newClientNameInput.current?.focus())
                }}
              />}
              {(account.role === "Customer" || !selectedClientId) && (
                <Field
                  label={
                    account.role !== "Customer" && savedClients.length > 0
                      ? "New client name"
                      : "Client name"
                  }
                  hint={
                    account.role === "Customer"
                      ? "Customer bookings use your account identity."
                      : savedClients.length > 0
                        ? "Enter a name for this booking. This does not create a sign-in account."
                        : "No saved clients available. Enter the client's name for this booking."
                  }
                >
                  <input
                    ref={newClientNameInput}
                    className={inputClass}
                    required
                    minLength={2}
                    maxLength={120}
                    readOnly={account.role === "Customer"}
                    value={input.client}
                    onChange={(event) => update("client", event.target.value)}
                    placeholder="e.g. Maria Santos"
                  />
                </Field>
              )}
              {isManager(account.role) && !selectedClientId && <Field label="New client email (optional)" hint="Creates a shop client record, not a sign-in account.">
                <input type="email" className={inputClass} value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} placeholder="name@example.com" />
              </Field>}
              <Field
                label="Service"
                hint="Price and duration come from the live service library."
              >
                <select
                  className={inputClass}
                  required
                  value={input.serviceId}
                  onChange={(event) => update("serviceId", event.target.value)}
                >
                  <option value="">Choose a service</option>
                  {active.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.durationMinutes} min ·{" "}
                      {peso(item.amount)}
                    </option>
                  ))}
                </select>
              </Field>
              {!active.length && !bookingIssue && (
                <p className="text-xs text-amber-800">
                  No active services. An Administrator or Manager must add or
                  review the service library first.
                </p>
              )}
              <Field
                label="Notes (optional)"
                hint="Preferences or special requests. Maximum 1,000 characters."
              >
                <textarea
                  className={inputClass}
                  maxLength={1000}
                  rows={3}
                  value={input.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  placeholder="Anything your service provider should know?"
                />
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <Field label="Provider preference" hint="Choose a provider now, or pick an available provider when you arrive.">
                <select
                  className={inputClass}
                  value={input.providerId}
                  disabled={business.shopType === "solo"}
                  onChange={(event) => update("providerId", event.target.value)}
                >
                  <option value="">Any available provider — choose at the shop</option>
                  {providers.map((record) => (
                    <option key={record.id} value={record.id}>
                      {String(record.name)}
                    </option>
                  ))}
                </select>
              </Field>
              {business.shopType === "solo" && <div className="rounded-lg bg-secondary p-3 text-xs text-primary">Your booking is automatically assigned to {String(provider?.name || "the shop manager")}.{typeof business.barberBio === "string" && business.barberBio && <p className="mt-2 text-muted-foreground">{business.barberBio}</p>}</div>}
              {!providers.length && (
                <p className="text-xs text-amber-800">
                  No active providers. Ask an Administrator or Manager to
                  publish Service Providers in Team.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date">
                  <input
                    required
                    type="date"
                    min={manilaDate()}
                    className={inputClass}
                    value={input.date}
                    onChange={(event) => update("date", event.target.value)}
                  />
                </Field>
                <Field label="Time (PHT)">
                  <TimePicker label="Booking time" value={input.time} change={(value) => update("time", value)} />
                </Field>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-sm font-semibold">Suggested start times</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">These times fit the shop’s hours and your service duration. Provider availability is checked when you reserve.</p>
                <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto" role="group" aria-label="Suggested start times">
                  {suggestedTimes.map((time) => (
                    <Button key={time} variant={input.time === time ? "primary" : "secondary"} aria-pressed={input.time === time} onClick={() => update("time", time)}>{formatTime12(time)}</Button>
                  ))}
                </div>
                {!suggestedTimes.length && <p role="status" className="mt-2 text-sm text-muted-foreground">No suggested times for this date. Try another day or check with the shop.</p>}
              </div>
              <p className="rounded-lg bg-secondary/60 p-3 text-sm leading-relaxed text-primary">
                Your service takes {service?.durationMinutes} minutes. Choose a future time in 15-minute intervals, with enough time before the shop closes. We reserve capacity for the full service. With “Any available provider,” choose an available provider at the shop.
              </p>
            </>
          )}
          {step === 3 && (
            <div className="rounded-xl bg-background p-4">
              <div className="mb-4 flex items-center gap-2 text-primary">
                <CalendarDays size={20} />
                <h3 className="font-display font-bold">
                  Your booking, at a glance
                </h3>
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-xs">
                {[
                  ["Client", input.client],
                  ["Service", service?.name],
                  ["Provider", provider?.name || "Choose an available provider at the shop"],
                  ["Date & time", `${input.date} · ${formatTime12(input.time)} PHT`],
                  ["Duration", `${service?.durationMinutes} minutes`],
                  ["Payment", "Pay at studio"],
                  ["Total", peso(service?.amount || 0)],
                ].map(([label, value]) => (
                  <div className="contents" key={String(label)}>
                    <dt className="text-muted-foreground">{String(label)}</dt>
                    <dd className="font-semibold">{String(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Status will be Pending until the manager accepts your request. No online payment is
                collected.
              </p>
            </div>
          )}
          {error && <ErrorBox message={error} />}
        </fieldset>
        <div className="flex justify-between border-t border-border px-5 py-4">
          <Button
            disabled={busy}
            variant="secondary"
            icon={step > 1 ? ArrowLeft : undefined}
            onClick={() => (step > 1 ? setStep(step - 1) : close())}
          >
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          <Button
            type="submit"
            disabled={busy || !!bookingIssue}
            variant={tabs ? "booking" : "primary"}
            icon={step === 3 ? Check : ArrowRight}
          >
            {busy
              ? "Reserving…"
              : step === 3
                ? "Reserve appointment"
                : "Continue"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ServiceDropdown({
  label,
  options,
  value,
  onChange,
  maxLength,
  minLength = 1,
}: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  maxLength: number
  minLength?: number
}) {
  const [custom, setCustom] = useState(!!value && !options.includes(value))
  const selectedIndex = options.indexOf(value)
  return (
    <div className="grid gap-3">
      <Field
        label={label}
        hint={
          options.length
            ? "Select an existing value or choose Enter a new value."
            : "No saved options yet. Choose Enter a new value to get started."
        }
      >
        <select
          required
          aria-label={label}
          className={inputClass}
          value={
            custom ? "custom" : selectedIndex >= 0 ? String(selectedIndex) : ""
          }
          onChange={(event) => {
            const choice = event.target.value
            setCustom(choice === "custom")
            onChange(
              choice === "custom" || choice === ""
                ? ""
                : options[Number(choice)],
            )
          }}
        >
          <option value="" disabled>
            Choose {label.toLowerCase()}…
          </option>
          {options.map((option, index) => (
            <option key={option} value={String(index)}>
              {option}
            </option>
          ))}
          <option value="custom">Enter a new value…</option>
        </select>
      </Field>
      {custom && (
        <Field label={`New ${label.toLowerCase()}`}>
          <input
            required
            aria-label={`New ${label.toLowerCase()}`}
            className={inputClass}
            minLength={minLength}
            maxLength={maxLength}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={`Enter ${label.toLowerCase()}`}
          />
        </Field>
      )}
    </div>
  )
}

function ServiceModal({
  service,
  services,
  close,
  saved,
}: {
  service: Service | null
  services: Service[]
  close: () => void
  saved: () => void
}) {
  const suggestions = (key: "name" | "category") =>
    [
      ...new Map(
        [
          ...(key === "name" ? defaultServiceNames : defaultCategories),
          ...services.map((item) => item[key].trim()),
        ]
          .filter(Boolean)
          .map((value) => [value.toLocaleLowerCase(), value]),
      ).values(),
    ].sort((first, second) => first.localeCompare(second))
  const serviceNames = suggestions("name")
  const categories = suggestions("category")
  const serviceCategoryByName = new Map(
    [
      ...Object.entries(defaultServiceCategories),
      ...services.map((item) => [item.name.trim(), item.category.trim()]),
    ].map(([name, category]) => [name.toLocaleLowerCase(), category]),
  )
  const [form, setForm] = useState({
    name: service?.name || "",
    category: service?.category || "",
    amount: service ? String(service.amount) : "",
    duration: String(service?.durationMinutes || 60),
    status: service?.status === "Archived" ? "Archived" : "Active",
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [photo, setPhoto] = useState({
    imageUrl: service?.imageUrl || "",
    imagePublicId: service?.imagePublicId || "",
  })
  const photoInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("")
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError("")
    setBusy(true)
    try {
      const durationMinutes = Number(form.duration)
      bookingSlots("00:00", durationMinutes)
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        amount: moneyNumber(form.amount),
        durationMinutes,
        status: form.status,
        ...(service?.sourceCatalogId
          ? { sourceCatalogId: service.sourceCatalogId }
          : {}),
      }
      if (payload.name.length < 2)
        throw new Error("Enter a service name with at least 2 characters.")
      if (!payload.category) throw new Error("Enter a service category.")
      if (services.some((item) => item.id !== service?.id && serviceIdentity(item.name, item.category) === serviceIdentity(payload.name, payload.category)))
        throw new Error("This service already exists in this category. Edit or reactivate it instead of adding another copy.")
      let servicePhoto = photo
      if (photoFile) {
        servicePhoto = await uploadServiceImage(photoFile)
        setPhoto(servicePhoto)
        setPhotoFile(null)
        if (photoInput.current) photoInput.current.value = ""
      }
      const record = { ...payload, ...servicePhoto }
      if (service?.id) await updateRecord("services", service.id, record)
      else await createRecord("services", record)
      saved()
      close()
    } catch (failure) {
      setError(friendlyError(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={service ? "Edit service" : "Add a service"}
      subtitle="Updates the service library, catalog, and booking menu."
      close={close}
      busy={busy}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="grid gap-4 p-5">
          <Field
            label="Service photo (optional)"
            hint="JPG, PNG, or WebP · up to 5 MB. Uploaded to Cloudinary when you save."
          >
            <div className="rounded-lg border border-dashed border-border bg-background p-3">
              {(photoPreview || photo.imageUrl) && (
                <img
                  src={photoPreview || photo.imageUrl}
                  alt="Service photo preview"
                  className="mb-3 h-36 w-full rounded-lg object-cover"
                />
              )}
              <input
                ref={photoInput}
                aria-label="Upload service photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  try {
                    validateServiceImage(file)
                    setPhotoFile(file)
                    setError("")
                  } catch (failure) {
                    event.target.value = ""
                    setError(friendlyError(failure))
                  }
                }}
              />
              {(photoFile || photo.imageUrl) && (
                <Button
                  variant="ghost"
                  className="mt-2"
                  onClick={() => {
                    setPhotoFile(null)
                    setPhoto({ imageUrl: "", imagePublicId: "" })
                    if (photoInput.current) photoInput.current.value = ""
                  }}
                >
                  Remove photo
                </Button>
              )}
            </div>
          </Field>
          <ServiceDropdown
            label="Service name"
            options={serviceNames}
            value={form.name}
            onChange={(name) =>
              setForm((current) => ({
                ...current,
                name,
                category:
                  serviceCategoryByName.get(name.toLocaleLowerCase()) ||
                  current.category,
              }))
            }
            minLength={2}
            maxLength={120}
          />
          <ServiceDropdown
            label="Category"
            options={categories}
            value={form.category}
            onChange={(category) =>
              setForm((current) => ({ ...current, category }))
            }
            maxLength={80}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid self-start content-start gap-1.5 text-sm font-medium">
              <span>Price (PHP)</span>
              <input
                type="number"
                required
                min={0}
                max={1000000}
                step="0.01"
                className={inputClass}
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                placeholder="350.00"
              />
            </label>
            <Field
              label="Duration (minutes)"
              hint="1–240 minutes. Enter any whole-minute duration."
            >
              <input
                type="number"
                required
                min={1}
                max={240}
                step={1}
                className={inputClass}
                value={form.duration}
                onChange={(event) =>
                  setForm({ ...form, duration: event.target.value })
                }
              />
            </Field>
          </div>
          <Field
            label="Availability"
            hint="Archived services cannot be booked. Existing appointments keep their original price."
          >
            <select
              className={inputClass}
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
            >
              <option>Active</option>
              <option>Archived</option>
            </select>
          </Field>
          {error && <ErrorBox message={error} />}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button disabled={busy} variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy
              ? photoFile
                ? "Uploading photo…"
                : "Saving…"
              : "Save service"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
function CustomerModal({
  customer,
  close,
  saved,
}: {
  customer: SmartCutRecord | null
  close: () => void
  saved: () => void
}) {
  const [form, setForm] = useState({
    name: String(customer?.name || customer?.rows?.[0] || ""),
    email: String(customer?.email || customer?.rows?.[1] || ""),
    phone: String(customer?.phone || ""),
    customerId: String(customer?.customerId || ""),
    notes: String(customer?.notes || customer?.rows?.[2] || ""),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <Modal
      title={customer ? "Edit customer" : "Add a customer"}
      subtitle={
        customer
          ? "Update contact details and preferences. Existing bookings and receipts remain unchanged."
          : "Create a studio record, not a sign-in account."
      }
      close={close}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError("")
          try {
            if (form.name.trim().length < 2)
              throw new Error("Enter a full name with at least 2 characters.")
            const payload = Object.fromEntries(
              Object.entries(form).map(([key, value]) => [key, value.trim()]),
            )
            if (customer) await updateRecord("clients", customer.id, payload)
            else await createRecord("clients", payload)
            saved()
            close()
          } catch (failure) {
            setError(friendlyError(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 p-5">
          {(["name", "email", "phone", "customerId"] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  name: "Full name",
                  email: "Email (optional)",
                  phone: "Phone (optional)",
                  customerId: "Customer account UID (optional)",
                }[key]
              }
              hint={
                key === "customerId"
                  ? "Use the exact Firebase Authentication UID to link this customer’s appointments and receipts. Leave blank for walk-ins."
                  : undefined
              }
            >
              <input
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                required={key === "name"}
                minLength={key === "name" ? 2 : undefined}
                maxLength={120}
                className={inputClass}
                value={form[key]}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
                placeholder={
                  {
                    name: "e.g. Maria Santos",
                    email: "name@example.com",
                    phone: "+63 9XX XXX XXXX",
                    customerId: "Firebase UID, not an email address",
                  }[key]
                }
              />
            </Field>
          ))}
          <Field label="Preferences / notes">
            <textarea
              rows={3}
              maxLength={1000}
              className={inputClass}
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              placeholder="Preferred service, styling notes…"
            />
          </Field>
          {error && <ErrorBox message={error} />}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button disabled={busy} variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save customer"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
function CheckoutModal({
  appointment,
  close,
  saved,
  statusOnly = false,
  confirmed = true,
}: {
  appointment: SmartCutRecord
  close: () => void
  saved: () => void
  statusOnly?: boolean
  confirmed?: boolean
}) {
  const [method, setMethod] = useState("Cash")
  const [received, setReceived] = useState(String(bookingAmount(appointment)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const saving = useRef(false)
  if (!confirmed)
    return <Modal title="Waiting for live confirmation" close={close}>
      <Empty icon={Clock3} title="Connecting to Firebase" description="Wait for the latest booking status before recording payment. No new payment is being submitted from this screen." action={<Button onClick={close}>Close</Button>} />
    </Modal>
  if (appointment.paymentStatus === "Paid")
    return <Modal title="Payment already recorded" close={close}>
      <Empty icon={CheckCircle2} title="Paid" description="This booking has already been paid. No additional payment will be recorded." action={<Button onClick={close}>Done</Button>} />
    </Modal>
  if (!awaitingPayment(appointment))
    return <Modal title="Payment is not available" close={close}>
      <Empty icon={Clock3} title="Check the latest booking status" description="Only completed, unpaid bookings can be collected. This booking may have changed in another session." action={<Button onClick={close}>Close</Button>} />
    </Modal>
  return (
    <Modal
      title="Record received payment"
      subtitle="This logs an existing payment. It does not charge a card or wallet."
      close={close}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy || saving.current) return
          saving.current = true
          setBusy(true)
          setError("")
          try {
            if (
              !statusOnly && method === "Cash" &&
              moneyNumber(received) < bookingAmount(appointment)
            )
              throw new Error("Cash received must cover the appointment total.")
            await checkoutAppointment(appointment.id, method)
            saved()
            close()
          } catch (failure) {
            setError(friendlyError(failure))
          } finally {
            saving.current = false
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 p-5">
          <div className="rounded-lg bg-background p-4">
            <p className="text-xs font-semibold">
              {bookingClient(appointment)} · {String(appointment.service)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {String(appointment.date)} · {String(appointment.provider)}
            </p>
            {!statusOnly && <p className="mt-3 font-display text-2xl font-bold">
              {peso(bookingAmount(appointment))}
            </p>}
          </div>
          <Field label="Payment method">
            <select
              className={inputClass}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {["Cash", "GCash", "Card", "Bank transfer"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          {!statusOnly && method === "Cash" && (
            <>
              <Field label="Cash received (PHP)">
                <input
                  type="number"
                  required
                  step="0.01"
                  min={bookingAmount(appointment)}
                  className={inputClass}
                  value={received}
                  onChange={(event) => setReceived(event.target.value)}
                />
              </Field>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Change due</span>
                <strong>
                  {peso(
                    Math.max(numeric(received) - bookingAmount(appointment), 0),
                  )}
                </strong>
              </div>
            </>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {statusOnly ? "Confirm only after the full service payment is received. The appointment will show Paid. Financial records and receipts remain available only to management." : <>Confirm only after the payment is received. This action creates an
            immutable payment and matching sale; duplicate checkout is prevented
            transactionally.</>}
          </p>
          {error && <ErrorBox message={error} />}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button disabled={busy} variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} type="submit" icon={Check}>
            {busy ? "Recording…" : "Confirm received payment"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
function PayrollModal({
  providers,
  existing,
  close,
  saved,
}: {
  providers: SmartCutRecord[]
  existing: SmartCutRecord[]
  close: () => void
  saved: () => void
}) {
  const [providerId, setProviderId] = useState("")
  const [start, setStart] = useState(`${manilaDate().slice(0, 7)}-01`)
  const [end, setEnd] = useState(manilaDate())
  const [base, setBase] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const net = numeric(base)
  return (
    <Modal
      title="Create payroll statement"
      subtitle="Calculates compensation. Does not transfer funds or mark payroll paid."
      close={close}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError("")
          try {
            if (!providerId || start > end || net < 0)
              throw new Error(
                "Select a provider, enter a valid date range, and provide a non-negative base pay.",
              )
            if (
              existing.some(
                (record) =>
                  record.providerId === providerId &&
                  String(record.start) <= end &&
                  String(record.end) >= start,
              )
            )
              throw new Error(
                "This provider already has a statement for an overlapping pay period.",
              )
            const provider = providers.find(
              (record) => record.id === providerId,
            )
            await createPayrollStatement({
              providerId,
              provider: String(provider?.name),
              start,
              end,
              base: moneyNumber(base),
              net,
              baseCents: Math.round(moneyNumber(base) * 100),
              netCents: Math.round(net * 100),
              status: "Recorded",
            })
            saved()
            close()
          } catch (failure) {
            setError(friendlyError(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 p-5">
          <Field label="Service Provider">
            <select
              required
              className={inputClass}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">Choose a provider</option>
              {providers.map((record) => (
                <option key={record.id} value={record.id}>
                  {String(record.name)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start">
              <input
                type="date"
                required
                max={end}
                className={inputClass}
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                required
                min={start}
                max={manilaDate()}
                className={inputClass}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </Field>
            <label className="col-span-2 grid gap-1.5 text-sm font-medium">
              <span>Base pay (PHP)</span>
              <input
                type="number"
                required
                min={0}
                max={1000000}
                step="0.01"
                className={inputClass}
                value={base}
                onChange={(event) => setBase(event.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          <div className="grid gap-2 rounded-lg bg-background p-3 text-xs">
            <div className="flex justify-between">
              <span>Net pay</span>
              <strong className="text-primary">{peso(net)}</strong>
            </div>
          </div>
          {error && <ErrorBox message={error} />}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button disabled={busy} variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Record statement"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function FeedbackSelect(props: React.ComponentProps<"select">) {
  return <select {...props} className={inputClass} />
}
function FeedbackTextarea(props: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={inputClass} />
}
function FeedbackPage({ account }: { account: UserProfile }) {
  const navigate = useNavigate()
  const admin = account.role === "Administrator"
  const shopId = account.role === "Customer" ? account.activeShopId : account.shopId
  const [data, setData] = useState<CollectionState>(initialCollection)
  const [loadedScope, setLoadedScope] = useState("")
  const [retry, setRetry] = useState(0)
  const scopeKey = `${account.uid}:${account.role}`
  const state = loadedScope === scopeKey ? data : initialCollection
  const [category, setCategory] = useState("Bug")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [scope, setScope] = useState(shopId ? "shop" : "general")
  const [filter, setFilter] = useState(admin ? "New" : "All")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  useEffect(() => {
    let active = true
    setData(initialCollection)
    setLoadedScope(scopeKey)
    const stop = subscribeFeedback(account.role,
      (records) => { if (active) setData((current) => ({ ...current, records })) },
      (status, error) => { if (active) setData((current) => ({ ...current, status, error })) })
    return () => { active = false; stop() }
  }, [account.uid, account.role, retry])
  const reports = state.records.filter((record) =>
    (filter === "All" || record.status === filter) &&
    [record.senderName, record.senderRole, record.shopName, record.subject, record.message].join(" ").toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3"><BrandLogo /><span className="font-display text-lg font-bold">SmartCut.</span><Badge>{account.role}</Badge></div>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(account.activeShopId || account.shopId ? "/overview" : admin || account.role === "Customer" ? "/shops" : "/overview")}>Back to workspace</Button>
      </div>
    </header>
    <main className="mx-auto max-w-6xl p-5 sm:p-8">
      <PageHead title={admin ? "Feedback inbox" : "Report a problem"} description={admin
        ? "Private app reports from Customers, Managers, and Service Providers across all shops. New messages arrive in real time."
        : "Found an error or glitch? Send a private report to the SmartCut Administrator. This is app support, not a salon rating."}>
        <div className="grid justify-items-end gap-2">
          <WorkspaceClock />
        </div>
      </PageHead>
      {error && <ErrorBox message={error} />}
      {success && <span role="status" className="mb-4 block rounded-xl bg-secondary p-4 text-sm text-primary">{success}</span>}
      <div className={cx("grid items-start gap-5", !admin && "lg:grid-cols-2")}>
        {!admin && <form className="rounded-2xl border border-border bg-card p-5 sm:p-6" onSubmit={async (event) => {
          event.preventDefault()
          if (busy || state.status !== "connected") return
          setBusy(true); setError(""); setSuccess("")
          try {
            await submitFeedback({ subject, message, category, shopId: scope === "shop" ? shopId : undefined })
            setSubject(""); setMessage("")
            setSuccess("Your report was sent to the Administrator. You can track it below.")
          } catch (failure) { setError(friendlyError(failure)) }
          finally { setBusy(false) }
        }}>
          <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-secondary p-3 text-primary"><MessageSquare size={20} /></span><span className="font-display text-lg font-bold">Tell us what happened</span></div>
          <fieldset disabled={busy || state.status !== "connected"} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Report type"><FeedbackSelect value={category} onChange={(event) => setCategory(event.target.value)}>
                {[["Bug", "Error or glitch"], ["Booking", "Booking issue"], ["Payment", "Payment issue"], ["Account", "Account help"], ["Other", "Other"]].map(([value, title]) => <option key={value} value={value}>{title}</option>)}
              </FeedbackSelect></Field>
              <Field label="Related to"><FeedbackSelect value={scope} onChange={(event) => setScope(event.target.value)}>
                {shopId && <option value="shop">My current shop</option>}<option value="general">General app issue</option>
              </FeedbackSelect></Field>
            </div>
            <Field label="Subject"><FinanceInput required minLength={2} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe the problem" /></Field>
            <Field label="What happened?" hint="Include the page, what you clicked, and the error shown. Never include passwords, PINs, OTPs, or private IDs.">
              <FeedbackTextarea required minLength={10} maxLength={2000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us how to reproduce the problem…" />
            </Field>
            <span className="text-xs text-muted-foreground">{message.length}/2,000 characters · only you and the Administrator can read this report.</span>
            <Button type="submit" icon={MessageSquare} disabled={busy || state.status !== "connected"}>{busy ? "Sending…" : "Send report"}</Button>
          </fieldset>
        </form>}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid gap-4 border-b border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-display text-lg font-bold">{admin ? "Reports from all shops" : "My reports"}</span>
              <Badge>{state.status === "connected" ? `${state.records.filter((record) => record.status === "New").length} new` : "Connecting"}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {["All", "New", "Reviewed"].map((value) => <Button key={value} variant={filter === value ? "primary" : "secondary"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</Button>)}
            </div>
            <Field label="Search reports"><FinanceInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={admin ? "Name, shop, subject, or message" : "Subject or message"} /></Field>
            {state.status === "error" && <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>Reconnect feedback</Button>}
          </div>
          <DataBoundary state={state}>
            {reports.length ? <div className="max-h-96 divide-y divide-border overflow-y-auto">
              {reports.map((record) => <div key={record.id} className="grid gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2"><span className="break-words text-sm font-semibold">{String(record.subject)}</span><Badge>{String(record.status)}</Badge></div>
                <span className="text-xs text-muted-foreground">{String(record.category)} · {String(record.shopName || "General app issue")}{admin ? ` · ${record.senderName} (${record.senderRole})` : ""}</span>
                <span className="whitespace-pre-wrap break-words text-sm leading-relaxed">{String(record.message)}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 size={12} />{formatTimestampManila(record.createdAt)} · Philippine time</span>
                {!!record.updatedAt && <span className="text-xs text-muted-foreground">Status updated: {formatTimestampManila(record.updatedAt)}</span>}
                {admin && <Button variant="secondary" disabled={busy || state.status !== "connected"} onClick={async () => {
                  if (busy) return
                  setBusy(true); setError(""); setSuccess("")
                  try { await reviewFeedback(record.id, record.status === "Reviewed" ? "New" : "Reviewed"); setSuccess("Feedback status updated.") }
                  catch (failure) { setError(friendlyError(failure)) }
                  finally { setBusy(false) }
                }}>{record.status === "Reviewed" ? "Reopen report" : "Mark reviewed"}</Button>}
              </div>)}
            </div> : <Empty icon={MessageSquare} title="No reports in this view" description={admin ? "Reports will appear here when an account submits feedback." : "Your reports and their review status will appear here automatically."} />}
          </DataBoundary>
        </section>
      </div>
    </main>
  </div>
}

const router = createBrowserRouter([{ path: "*", Component: Workspace }])
export default function App() {
  return <RouterProvider router={router} />
}
