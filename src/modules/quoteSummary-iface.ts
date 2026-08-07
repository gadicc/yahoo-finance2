/*
 * To generate the initial file, we took the output of all submodules for
 * 'AAPL', 'OCDO.L', '0700.HK' and '^IXIC' and ran the results through
 * the awesome https://app.quicktype.io/.
 *
 * Manual cleanup afterwards:
 *
 *  1) Spaces: 4 to 2
 *  ~~2) Wrapped in a module~~ <--- undid this after tooling issues.
 *  3) Alphabeticalize QuoteSummaryResult
 *  4) RawNumberObj type to Date|number for coersion
 */

// @yf-schema: see the docs on how this file is automatically updated.
export interface QuoteSummaryResult {
  [key: string]: unknown;
  assetProfile?: AssetProfile;
  balanceSheetHistory?: BalanceSheetHistory;
  balanceSheetHistoryQuarterly?: BalanceSheetHistory;
  calendarEvents?: CalendarEvents;
  cashflowStatementHistory?: CashflowStatementHistory;
  cashflowStatementHistoryQuarterly?: CashflowStatementHistory;
  defaultKeyStatistics?: DefaultKeyStatistics;
  earnings?: QuoteSummaryEarnings;
  earningsHistory?: EarningsHistory;
  earningsTrend?: EarningsTrend;
  financialData?: FinancialData;
  fundOwnership?: Ownership;
  fundPerformance?: FundPerformance;
  fundProfile?: FundProfile;
  incomeStatementHistory?: IncomeStatementHistory;
  incomeStatementHistoryQuarterly?: IncomeStatementHistory;
  indexTrend?: IndexTrend;
  industryTrend?: Trend;
  insiderHolders?: Holders;
  insiderTransactions?: InsiderTransactions;
  institutionOwnership?: Ownership;
  majorDirectHolders?: Holders;
  majorHoldersBreakdown?: MajorHoldersBreakdown;
  netSharePurchaseActivity?: NetSharePurchaseActivity;
  price?: Price;
  quoteType?: QuoteType;
  recommendationTrend?: RecommendationTrend;
  secFilings?: SECFilings;
  sectorTrend?: Trend;
  summaryDetail?: SummaryDetail;
  summaryProfile?: SummaryProfile;
  topHoldings?: TopHoldings;
  upgradeDowngradeHistory?: UpgradeDowngradeHistory;
}

export interface AssetProfile {
  [key: string]: unknown;
  maxAge: number;
  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
  website?: string;
  industry?: string;
  industryDisp?: string;
  industryKey?: string;
  industrySymbol?: string;
  sector?: string;
  sectorDisp?: string;
  sectorKey?: string;
  longBusinessSummary?: string;
  fullTimeEmployees?: number;
  companyOfficers: CompanyOfficer[];
  auditRisk?: number;
  boardRisk?: number;
  compensationRisk?: number;
  shareHolderRightsRisk?: number;
  overallRisk?: number;
  governanceEpochDate?: Date;
  compensationAsOfEpochDate?: Date;
  name?: string; // 'Bitcoin';
  startDate?: Date; // new Date('2013-04-28')
  description?: string; // 'Bitcoin (BTC) is a cryptocurrency...'
  twitter?: string; // in e.g. "ADA-USD" (#418)
  irWebsite?: string; // "http://investor.apple.com/"
  executiveTeam?: unknown[];

  // crypto
  blockNumber?: number; // 771565,
  blockReward?: number; // 6.25,
  blockRewardReduction?: string; // "50%",
  netHashesPerSecond?: number; // "244051282584378770000",
  whitepaper?: string; // "https://bitcoin.org/bitcoin.pdf"
}

export interface CompanyOfficer {
  [key: string]: unknown;
  maxAge: number;
  name: string;
  age?: number;
  title: string;
  yearBorn?: number;
  fiscalYear?: number;
  totalPay?: number;
  exercisedValue?: number;
  unexercisedValue?: number;
}

export interface BalanceSheetHistory {
  [key: string]: unknown;
  balanceSheetStatements: BalanceSheetStatement[];
  maxAge: number;
}

export interface BalanceSheetStatement {
  maxAge: number;
  endDate: Date;
}

export interface CalendarEvents {
  [key: string]: unknown;
  maxAge: number;
  earnings: CalendarEventsEarnings;
  exDividendDate?: Date;
  dividendDate?: Date;
}

export interface CalendarEventsEarnings {
  [key: string]: unknown;
  earningsCallDate: Date[];
  isEarningsDateEstimate?: boolean;
  earningsDate: Date[];
  earningsAverage?: number;
  earningsLow?: number;
  earningsHigh?: number;
  revenueAverage?: number;
  revenueLow?: number;
  revenueHigh?: number;
  defaultMethodology?: "nongaap" | "gaap";
}

export interface CashflowStatementHistory {
  cashflowStatements: CashflowStatement[];
  maxAge: number;
}

export interface CashflowStatement {
  maxAge: number;
  endDate: Date;
  netIncome: number;
}

export interface DefaultKeyStatistics {
  [key: string]: unknown;
  maxAge: number;
  priceHint: number;
  enterpriseValue?: number;
  forwardPE?: number;
  profitMargins?: number;
  floatShares?: number;
  sharesOutstanding?: number;
  sharesShort?: number;
  sharesShortPriorMonth?: Date;
  sharesShortPreviousMonthDate?: Date;
  dateShortInterest?: Date;
  sharesPercentSharesOut?: number;
  heldPercentInsiders?: number;
  heldPercentInstitutions?: number;
  shortRatio?: number;
  shortPercentOfFloat?: number;
  beta?: number;
  impliedSharesOutstanding?: number;
  category: null | string;
  bookValue?: number;
  priceToBook?: number;
  fundFamily: null | string;
  legalType: null | string;
  lastFiscalYearEnd?: Date;
  nextFiscalYearEnd?: Date;
  mostRecentQuarter?: Date;
  earningsQuarterlyGrowth?: number;
  netIncomeToCommon?: number;
  trailingEps?: number;
  forwardEps?: number;
  pegRatio?: number;
  lastSplitFactor: null | string;
  lastSplitDate?: number;
  enterpriseToRevenue?: number;
  enterpriseToEbitda?: number;
  "52WeekChange"?: number;
  SandP52WeekChange?: number;
  lastDividendValue?: number;
  lastDividendDate?: Date;
  ytdReturn?: number;
  beta3Year?: number;
  totalAssets?: number;
  yield?: number;
  fundInceptionDate?: Date;
  threeYearAverageReturn?: number;
  fiveYearAverageReturn?: number;
  morningStarOverallRating?: number;
  morningStarRiskRating?: number;
  annualReportExpenseRatio?: number;
  lastCapGain?: number;
  annualHoldingsTurnover?: number;
  latestShareClass?: unknown;
  leadInvestor?: unknown;
}

export interface QuoteSummaryEarnings {
  [key: string]: unknown;
  maxAge: number;
  earningsChart: EarningsChart;
  financialsChart: FinancialsChart;
  financialCurrency?: string;
  defaultMethodology: "nongaap" | "gaap";
}

export interface EarningsChart {
  [key: string]: unknown;
  quarterly: EarningsChartQuarterly[];
  currentQuarterEstimate?: number;
  currentQuarterEstimateDate?: string;
  currentQuarterEstimateYear?: number;
  earningsDate: Date[];
  isEarningsDateEstimate?: boolean;
  currentCalendarQuarter?: string; // "2Q2026",
  currentFiscalQuarter?: string; // "2Q2026",
  currentPeriodEndDate?: Date; // 1782777600
}

export interface EarningsChartQuarterly {
  [key: string]: unknown;
  date: string;
  actual?: number;
  estimate: number;
  fiscalQuarter: string; // "3Q2025",
  calendarQuarter: string; // "3Q2025",
  difference: string; // "0.39",
  surprisePct: string; // "25.2",
  periodEndDate: Date; // 1759190400,
  reportedDate: Date; // 1761854460
}

export interface FinancialsChart {
  [key: string]: unknown;
  yearly: Yearly[];
  quarterly: FinancialsChartQuarterly[];
}

export interface FinancialsChartQuarterly {
  [key: string]: unknown;
  date: string;
  revenue: number;
  earnings: number;
  fiscalQuarter: string; // "2Q2026",
  profitMargin: number; // 0.042171955
}

export interface Yearly {
  [key: string]: unknown;
  date: number;
  revenue: number;
  earnings: number;
  profitMargin: number; // 0.042171955
}

export interface EarningsHistory {
  [key: string]: unknown;
  history: EarningsHistoryHistory[];
  maxAge: number;
  defaultMethodology: "nongaap" | "gaap";
}

export interface EarningsHistoryHistory {
  [key: string]: unknown;
  maxAge: number;
  epsActual: number | null;
  epsEstimate: number | null;
  epsDifference: number | null;
  surprisePercent: number | null;
  quarter: Date | null;
  period: string;
  currency?: string;
}

export interface EarningsTrend {
  [key: string]: unknown;
  trend: EarningsTrendTrend[];
  maxAge: number;
  defaultMethodology: "nongaap" | "gaap";
}

export interface EarningsTrendTrend {
  [key: string]: unknown;
  maxAge: number;
  period: string;
  endDate: Date | null;
  growth: number | null;
  earningsEstimate: EarningsEstimate;
  revenueEstimate: RevenueEstimate;
  epsTrend: EpsTrend;
  epsRevisions: EpsRevisions;
}

export interface EarningsEstimate {
  [key: string]: unknown;
  avg: number | null;
  low: number | null;
  high: number | null;
  yearAgoEps: number | null;
  numberOfAnalysts: number | null;
  growth: number | null;
  earningsCurrency?: string | null;
}

export interface EpsRevisions {
  [key: string]: unknown;
  upLast7days?: number | null;
  upLast30days?: number | null;
  upLast90days?: number | null;
  downLast7Days?: number | null;
  downLast30days?: number | null;
  downLast90days?: number | null;
  epsRevisionsCurrency?: string | null;
}

export interface EpsTrend {
  [key: string]: unknown;
  current: number | null;
  "7daysAgo": number | null;
  "30daysAgo": number | null;
  "60daysAgo": number | null;
  "90daysAgo": number | null;
  epsTrendCurrency?: string | null;
}

export interface RevenueEstimate {
  [key: string]: unknown;
  avg: number | null;
  low: number | null;
  high: number | null;
  numberOfAnalysts: number | null;
  yearAgoRevenue: number | null;
  growth: number | null;
  revenueCurrency?: string | null;
}

export interface FinancialData {
  [key: string]: unknown;
  maxAge: number;
  currentPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  targetMeanPrice?: number;
  targetMedianPrice?: number;
  recommendationMean?: number;
  recommendationKey: string;
  numberOfAnalystOpinions?: number;
  totalCash?: number;
  totalCashPerShare?: number;
  ebitda?: number;
  totalDebt?: number;
  quickRatio?: number;
  currentRatio?: number;
  totalRevenue?: number;
  debtToEquity?: number;
  revenuePerShare?: number;
  returnOnAssets?: number;
  returnOnEquity?: number;
  grossProfits?: number;
  freeCashflow?: number;
  operatingCashflow?: number;
  earningsGrowth?: number;
  revenueGrowth?: number;
  grossMargins?: number;
  ebitdaMargins?: number;
  operatingMargins?: number;
  profitMargins?: number;
  financialCurrency: string | null;
}

export interface Ownership {
  [key: string]: unknown;
  maxAge: number;
  ownershipList: OwnershipList[];
}

export interface OwnershipList {
  [key: string]: unknown;
  maxAge: number;
  reportDate: Date;
  organization: string;
  pctHeld: number;
  position: number;
  value: number;
  pctChange?: number;
}

export interface FundPerformance {
  [key: string]: unknown;
  maxAge: number;
  loadAdjustedReturns?: PeriodRange;
  rankInCategory?: PeriodRange;
  performanceOverview: FundPerformancePerformanceOverview;
  performanceOverviewCat: FundPerformancePerformanceOverviewCat;
  trailingReturns: FundPerformanceTrailingReturns;
  trailingReturnsNav: FundPerformanceTrailingReturns;
  trailingReturnsCat: FundPerformanceTrailingReturns;
  annualTotalReturns: FundPerformanceReturns;
  pastQuarterlyReturns: FundPerformanceReturns;
  riskOverviewStatistics: FundPerformanceRiskOverviewStats;
  riskOverviewStatisticsCat: FundPerformanceRiskOverviewStatsCat;
  fundCategoryName?: string; // "Large Growth"
}

export interface PeriodRange {
  [key: string]: unknown;
  asOfDate?: Date;
  ytd?: number;
  oneMonth?: number;
  threeMonth?: number;
  oneYear?: number;
  threeYear?: number;
  fiveYear?: number;
  tenYear?: number;
}

export interface FundPerformanceTrailingReturns extends PeriodRange {
  [key: string]: unknown;
  lastBullMkt?: number;
  lastBearMkt?: number;
}

export interface FundPerformancePerformanceOverview {
  [key: string]: unknown;
  asOfDate?: Date;
  ytdReturnPct?: number;
  oneYearTotalReturn?: number;
  threeYearTotalReturn?: number;
  fiveYrAvgReturnPct?: number;
  morningStarReturnRating?: number;
  numYearsUp?: number;
  numYearsDown?: number;
  bestOneYrTotalReturn?: number;
  worstOneYrTotalReturn?: number;
  bestThreeYrTotalReturn?: number;
  worstThreeYrTotalReturn?: number;
}

export interface FundPerformancePerformanceOverviewCat {
  [key: string]: unknown;
  ytdReturnPct?: number;
  fiveYrAvgReturnPct?: number;
  oneYearTotalReturn?: number; // 0.29811978,
  threeYearTotalReturn?: number; // 0.117706604
}

export interface FundPerformanceReturns {
  [key: string]: unknown;
  returns: FundPerformanceReturnsRow[];
  returnsCat?: FundPerformanceReturnsRow[];
}

export interface FundPerformanceReturnsRow {
  [key: string]: unknown;
  year: number; // coerce to number from string "2020"
  annualValue?: number;
  q1?: number;
  q2?: number;
  q3?: number;
  q4?: number;
}

export interface FundPerformanceRiskOverviewStats {
  [key: string]: unknown;
  riskStatistics: FundPerformanceRiskOverviewStatsRow[];
  riskRating?: number;
}

export interface FundPerformanceRiskOverviewStatsCat {
  [key: string]: unknown;
  riskStatisticsCat: FundPerformanceRiskOverviewStatsRow[];
}

export interface FundPerformanceRiskOverviewStatsRow {
  [key: string]: unknown;
  year: string; // "5y" | "3y" | "10y" | anything else?
  alpha: number; // 7.76
  beta: number; // 1.04
  meanAnnualReturn: number; // 2.05
  rSquared: number; // 84.03
  stdDev?: number; // 17.12
  sharpeRatio: number; // 1.37
  treynorRatio: number; // 23.61
}

export interface FundProfile {
  [key: string]: unknown;
  maxAge: number;
  styleBoxUrl?: null | string;
  family: null | string;
  categoryName: null | string;
  legalType: null | string;
  managementInfo?: FundProfileManagementInfo;
  feesExpensesInvestment?: FundProfileFeesExpensesInvestment;
  feesExpensesInvestmentCat?: FundProfileFeesExpensesInvestmentCat;
  brokerages?: FundProfileBrokerage[];
  initInvestment?: number;
  initIraInvestment?: number;
  initAipInvestment?: number;
  subseqInvestment?: number;
  subseqIraInvestment?: number;
  subseqAipInvestment?: number;
}

export interface FundProfileManagementInfo {
  [key: string]: unknown;
  managerName: null | string;
  managerBio: null | string;
  startdate?: Date;
}

export interface FundProfileFeesExpensesInvestment {
  [key: string]: unknown;
  annualHoldingsTurnover?: number;
  annualReportExpenseRatio?: number;
  grossExpRatio?: number;
  netExpRatio?: number;
  projectionValues: object;
  totalNetAssets?: number;
}

export interface FundProfileFeesExpensesInvestmentCat
  extends Omit<FundProfileFeesExpensesInvestment, "projectionValues"> {
  [key: string]: unknown;
  projectionValuesCat: object;
}

export interface FundProfileBrokerage {
  [key: string]: unknown;
}

export interface IncomeStatementHistory {
  [key: string]: unknown;
  incomeStatementHistory: IncomeStatementHistoryElement[];
  maxAge: number;
}

export interface IncomeStatementHistoryElement {
  maxAge: number;
  endDate: Date;
  totalRevenue: number;
  costOfRevenue: number;
  grossProfit: number;
  researchDevelopment: null;
  sellingGeneralAdministrative: null;
  nonRecurring: null;
  otherOperatingExpenses: null;
  totalOperatingExpenses: number;
  operatingIncome: null;
  totalOtherIncomeExpenseNet: null;
  ebit: number;
  interestExpense: null;
  incomeBeforeTax: null;
  incomeTaxExpense: number;
  minorityInterest: null;
  netIncomeFromContinuingOps: null;
  discontinuedOperations: null;
  extraordinaryItems: null;
  effectOfAccountingCharges: null;
  otherItems: null;
  netIncome: number;
  netIncomeApplicableToCommonShares: null;
}

export interface IndexTrend {
  [key: string]: unknown;
  maxAge: number;
  symbol: string;
  peRatio?: number;
  pegRatio?: number;
  estimates: Estimate[];
}

export interface Estimate {
  [key: string]: unknown;
  period: string;
  growth?: number;
}

export interface Trend {
  [key: string]: unknown;
  maxAge: number;
  symbol: null;
  estimates: unknown[];
}

export interface Holders {
  [key: string]: unknown;
  holders: Holder[];
  maxAge: number;
}

export interface Holder {
  [key: string]: unknown;
  maxAge: number;
  name: string;
  relation: Relation | string;
  url: string;
  transactionDescription: string;
  latestTransDate: Date;
  positionDirect?: number;
  positionDirectDate?: Date;
  positionIndirect?: number;
  positionIndirectDate?: Date;
  positionSummaryDate?: Date;
}

export enum Relation {
  ChairmanOfTheBoard = "Chairman of the Board",
  ChiefExecutiveOfficer = "Chief Executive Officer",
  ChiefFinancialOfficer = "Chief Financial Officer",
  ChiefOperatingOfficer = "Chief Operating Officer",
  ChiefTechnologyOfficer = "Chief Technology Officer",
  Director = "Director",
  DirectorIndependent = "Director (Independent)",
  Empty = "",
  GeneralCounsel = "General Counsel",
  IndependentNonExecutiveDirector = "Independent Non-Executive Director",
  Officer = "Officer",
  President = "President",
}

export interface InsiderTransactions {
  [key: string]: unknown;
  transactions: Transaction[];
  maxAge: number;
}

export interface Transaction {
  [key: string]: unknown;
  maxAge: number;
  shares: number;
  filerUrl: string;
  transactionText: string;
  filerName: string;
  filerRelation: Relation | string;
  moneyText: string;
  startDate: Date;
  ownership: OwnershipEnum | string;
  value?: number;
}

export enum OwnershipEnum {
  D = "D",
  I = "I",
}

export interface MajorHoldersBreakdown {
  [key: string]: unknown;
  maxAge: number;
  insidersPercentHeld?: number;
  institutionsPercentHeld?: number;
  institutionsFloatPercentHeld?: number;
  institutionsCount?: number;
}
export interface NetSharePurchaseActivity {
  [key: string]: unknown;
  maxAge: number;
  period: string;
  buyInfoCount: number;
  buyInfoShares: number;
  buyPercentInsiderShares?: number;
  sellInfoCount: number;
  sellInfoShares?: number;
  sellPercentInsiderShares?: number;
  netInfoCount: number;
  netInfoShares: number;
  netPercentInsiderShares?: number;
  totalInsiderShares: number;
  netInstSharesBuying: number; // 699075,
  netInstBuyingPercent: number; // 0.00051
}

/*
 * Dates are usually epoch numbers, but including other modules can change
 * result to include an ISODate.
 */
export interface Price {
  [key: string]: unknown;
  averageDailyVolume10Day?: number;
  averageDailyVolume3Month?: number;
  exchange?: string;
  exchangeName?: string;
  exchangeDataDelayedBy?: number;
  maxAge: number;
  priceHint: number;

  preMarketChangePercent?: number;
  preMarketChange?: number;
  preMarketTime?: Date;
  preMarketPrice?: number;
  preMarketSource?: string;

  regularMarketChangePercent?: number;
  regularMarketChange?: number;
  regularMarketTime?: Date;
  regularMarketPrice?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
  regularMarketSource?: string;
  regularMarketOpen?: number;

  postMarketChangePercent?: number;
  postMarketChange?: number;
  postMarketTime?: Date;
  postMarketPrice?: number;
  postMarketSource?: string;

  quoteSourceName?: string;
  quoteType: string;

  symbol: string;
  underlyingSymbol: null | string; // "GCM22.CMX" (from GC=F future)
  shortName: null | string;
  longName: null | string;

  lastMarket: null | string;

  /**
   * The current state of the market for the security.
   */
  marketState?:
    /**
     * - Pre-market before regular pre-market hours
     * - postMarket* fields are "overnight"
     * - e.g. "This price reflects trading activity during the overnight
     *     session on the Blue Ocean ATS, available 8 PM to 4 AM ET,
     *     Sunday through Thursday, when regular markets are closed."
     */
    | "PREPRE"
    /** Pre-market */
    | "PRE"
    /** Market open, regularMarket* fields are live. */
    | "REGULAR"
    /** Market closed, postMarket* fields cover "after hours" */
    | "CLOSED"
    /** Post-market */
    | "POST" // TODO, no current test fixture for this
    | "POSTPOST"
    /** Other values - will be removed once we're sure all values are covered */
    | string;

  marketCap?: number;

  // Crypto only?  Is Price actually Quote?  TODO after
  currency?: string;
  currencySymbol?: string;
  fromCurrency: string | null;
  toCurrency?: string | null;
  volume24Hr?: number;
  volumeAllCurrencies?: number;
  circulatingSupply?: number;

  // futures
  expireDate?: Date; // 1656374400,
  openInterest?: number; // 444411,
}

export interface QuoteType {
  [key: string]: unknown;
  exchange: string;
  quoteType: string;
  /** Optional, whereas `underlyingSymbol` is always present */
  symbol?: string;
  underlyingSymbol: string;
  shortName?: null | string;
  longName?: null | string;
  firstTradeDateEpochUtc?: null | Date;
  timeZoneFullName: string;
  timeZoneShortName: string;
  uuid: string;
  messageBoardId?: null | string;
  gmtOffSetMilliseconds: number;
  maxAge: number;
}

export interface RecommendationTrend {
  [key: string]: unknown;
  trend: RecommendationTrendTrend[];
  maxAge: number;
}

export interface RecommendationTrendTrend {
  [key: string]: unknown;
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface SECFilings {
  [key: string]: unknown;
  filings: Filing[];
  maxAge: number;
}

export interface Filing {
  [key: string]: unknown;
  date: string; // TODO: check the format
  epochDate: Date;
  type: FilingType;
  title: string;
  edgarUrl: string;
  maxAge: number;
  url?: string;
  exhibits?: { type: string; url: string; downloadUrl?: string }[];
}

// May consider switching this to string, as we keep finding more and more.
type FilingType =
  | "10-K"
  | "10-Q"
  | "8-K"
  | "8-K/A"
  | "10-K/A"
  | "10-Q/A"
  | "SD"
  | "PX14A6G"
  | "SC 13G/A"
  | "DEFA14A"
  | "25-NSE"
  | "S-8 POS"
  | "6-K"
  | "F-3ASR"
  | "SC 13D/A"
  | "20-F"
  | "425"
  | "SC14D9C"
  | "SC 13G"
  | "S-8"
  | "DEF 14A"
  | "F-10"
  | "S-3ASR"
  | "CORRESP"
  | "PX14A6N"
  | "N-PX"
  | "ARS"
  | "PRE 14A"
  | "F-6EF"
  | "S-3/A"
  | "S-3"
  | "POS AM"
  | "IRANNOTICE"
  | "20-F/A"
  | "11-K"
  | "DEFR14A"
  | "S4"
  | "RW"
  | "S-4/A"
  | "S-4"
  | "S-4MEF"
  | "PRER14A"
  | "8-A12B"
  | "D"
  | "SC 13D"
  | "NT 10-Q/A"
  | "F-4"
  | "POS EX"
  | "PREC14A";

export interface SummaryDetail {
  [key: string]: unknown;
  maxAge: number;
  priceHint: number;
  previousClose?: number; // missing in e.g. "APS.AX"
  open?: number;
  dayLow?: number;
  dayHigh?: number;
  regularMarketPreviousClose?: number; // missing in e.g. "APS.AX"
  regularMarketOpen?: number;
  regularMarketDayLow?: number;
  regularMarketDayHigh?: number;
  regularMarketVolume?: number;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: Date;
  payoutRatio?: number;
  fiveYearAvgDividendYield?: number;
  beta?: number;
  trailingPE?: number;
  forwardPE?: number;
  volume?: number;
  averageVolume?: number;
  averageVolume10days?: number;
  averageDailyVolume10Day?: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  marketCap?: number;
  fiftyDayAverage?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  twoHundredDayAverage?: number;
  priceToSalesTrailing12Months?: number;
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;
  currency: string;
  algorithm: null;
  tradeable: boolean;
  yield?: number;
  totalAssets?: number;
  navPrice?: number;
  ytdReturn?: number;
  fullyDilutedValue?: number; // 1543300664063,
  volume24HrMarketCapPercent?: number; // 0.021799117

  // crypto only (optional, or null in other types)
  // TODO: how does Price / SummaryDetail compare? common base?
  fromCurrency: string | null; // 'BTC'
  toCurrency?: string | null; // 'USD-X'
  lastMarket: string | null; // 'CoinMarketCap'
  volume24Hr?: number; // 62650314752
  volumeAllCurrencies?: number; // 62650314752
  circulatingSupply?: number; // 18638932
  startDate?: Date; // new Date(1367107200 * 1000)
  coinMarketCapLink?: string | null; // "https://coinmarketcap.com/currencies/cardano"
  maxSupply?: number; // 21000000,
  totalSupply?: number; // 20036072,

  // futures
  expireDate?: Date; // 1656374400,
  openInterest?: number; // 444411,

  // Money Markets, e.g. SWVXX (#905)
  averageMaturity?: number;

  nonDilutedMarketCap?: number; // 298395446540,
  allTimeHigh?: number; // 319.32,
  allTimeLow?: number; // 57.2
}

export interface SummaryProfile {
  [key: string]: unknown;
  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
  website?: string;
  industry?: string;
  industryDisp?: string;
  sector?: string;
  sectorDisp?: string;
  longBusinessSummary?: string;
  fullTimeEmployees?: number;
  companyOfficers: unknown[];
  maxAge: number;
  twitter?: string; // in e.g. "ADA-USD" (#418)

  industryKey?: string; // "consumer-electronics",
  sectorKey?: string; // "technology",
  irWebsite?: string; // "http://investor.apple.com/"
  executiveTeam?: unknown[]; // []

  // seems like for cryptocurency only
  // TODO: how does this relate to Quote type.  Common base?
  name?: string; // 'Bitcoin'
  startDate?: Date; // new Date('2013-04-28')
  description?: string; // 'Bitcoin (BTC) is a cryptocurrency...'
  whitepaper?: string; // "https://developers.cardano.org/"
  blockNumber?: number; // 771565,
  blockReward?: number; // 6.25,
  blockRewardReduction?: string; // "50%",
  netHashesPerSecond?: string; // "244051282584378770000"
}

export interface TopHoldings {
  [key: string]: unknown;
  maxAge: number;
  stockPosition?: number;
  bondPosition?: number;
  holdings: TopHoldingsHolding[];
  equityHoldings: TopHoldingsEquityHoldings;
  bondHoldings: object;
  bondRatings: TopHoldingsBondRating[];
  sectorWeightings: TopHoldingsSectorWeighting[];
  cashPosition?: number;
  otherPosition?: number;
  preferredPosition?: number;
  convertiblePosition?: number;
}

export interface TopHoldingsHolding {
  [key: string]: unknown;
  symbol: string;
  holdingName: string;
  holdingPercent: number;
}

export interface TopHoldingsEquityHoldings {
  [key: string]: unknown;
  medianMarketCap?: number;
  medianMarketCapCat?: number;
  priceToBook: number;
  priceToBookCat?: number;
  priceToCashflow: number;
  priceToCashflowCat?: number;
  priceToEarnings: number;
  priceToEarningsCat?: number;
  priceToSales: number;
  priceToSalesCat?: number;
  threeYearEarningsGrowth?: number;
  threeYearEarningsGrowthCat?: number;
}

export interface TopHoldingsBondRating {
  [key: string]: unknown;
  a?: number;
  aa?: number;
  aaa?: number;
  other?: number;
  b?: number;
  bb?: number;
  bbb?: number;
  below_b?: number;
  us_government?: number;
}

export interface TopHoldingsSectorWeighting {
  [key: string]: unknown;
  realestate?: number;
  consumer_cyclical?: number;
  basic_materials?: number;
  consumer_defensive?: number;
  technology?: number;
  communication_services?: number;
  financial_services?: number;
  utilities?: number;
  industrials?: number;
  energy?: number;
  healthcare?: number;
}

export interface UpgradeDowngradeHistory {
  [key: string]: unknown;
  history: UpgradeDowngradeHistoryHistory[];
  maxAge: number;
}

export interface UpgradeDowngradeHistoryHistory {
  [key: string]: unknown;
  epochGradeDate: Date;
  firm: string;
  toGrade: Grade;
  fromGrade?: Grade;
  action: Action;
  priceTargetAction:
    | "Lowers"
    | "Raises"
    | "Maintains"
    | "Announces"
    | "Adjusts"
    | "";
  currentPriceTarget: number; // 210,
  priorPriceTarget: number; // 230
}

export enum Action {
  Down = "down",
  Init = "init",
  Main = "main",
  Reit = "reit",
  Up = "up",
}

export enum Grade {
  Accumulate = "Accumulate",
  Add = "Add",
  Average = "Average",
  BelowAverage = "Below Average",
  Buy = "Buy",
  ConvictionBuy = "Conviction Buy",
  Empty = "",
  EqualWeight = "Equal-Weight",
  FairValue = "Fair Value",
  GradeEqualWeight = "Equal-weight",
  GradeLongTermBuy = "Long-term Buy",
  Hold = "Hold",
  LongTermBuy = "Long-Term Buy",
  MarketOutperform = "Market Outperform",
  MarketPerform = "Market Perform",
  Mixed = "Mixed",
  Negative = "Negative",
  Neutral = "Neutral",
  InLine = "In-Line",
  Outperform = "Outperform",
  Overweight = "Overweight",
  PeerPerform = "Peer Perform",
  Perform = "Perform",
  Positive = "Positive",
  Reduce = "Reduce",
  SectorOutperform = "Sector Outperform",
  SectorPerform = "Sector Perform",
  SectorWeight = "Sector Weight",
  Sell = "Sell",
  StrongBuy = "Strong Buy",
  TopPick = "Top Pick",
  Underperform = "Underperform",
  Underperformer = "Underperformer",
  Underweight = "Underweight",
  Trim = "Trim",
  AboveAverage = "Above Average",
  Inline = "In-line",
  Outperformer = "Outperformer",
  OVerweight = "OVerweight", // Not a typo, how it was returned from API
  Cautious = "Cautious",
  MarketWeight = "Market Weight",
  SectorUnderperform = "Sector Underperform",
  MarketUnderperform = "Market Underperform",
  Peerperform = "Peer perform",
  GraduallyAccumulate = "Gradually Accumulate",
  ActionListBuy = "Action List Buy",
  Performer = "Performer",
  SectorPerformer = "Sector Performer",
  SpeculativeBuy = "Speculative Buy",
  StrongSell = "Strong Sell",
  SpeculativeHold = "Speculative Hold",
  NotRated = "Not Rated",
  HoldNeutral = "Hold Neutral",
  Developing = "Developing",
  buy = "buy",
  HOld = "HOld", // Not a typo, how it was returned from API
  TradingSell = "Trading Sell",
  Tender = "Tender",
  marketperform = "market perform",
  BUy = "BUy", // Not a typo, how it was returned from API
}
