import { workspacePages } from "./navigation.ts";

export type GuideCopy = { title: [string, string]; summary: [string, string]; steps: [string, string][] };

export const userGuide: Record<string, GuideCopy> = {
  drafts: {
    title: ["보완 필요 거래", "Needs completion"],
    summary: ["명세서는 가맹점과 결제 총액, 영수증은 구매 품목을 제공합니다. 두 자료를 대조한 뒤 아직 거래 내역에 반영되지 않은 기록을 저장합니다.", "Statements provide merchants and payment totals; receipts provide purchased items. Reconcile both before saving entries to Transactions."],
    steps: [["명세서의 가맹점명은 품목명이 아닙니다. 영수증 품목을 열어 품목 합계와 영수증 총액을 확인하세요.", "A statement merchant is not an item. Open receipt items and compare their sum with the receipt total."], ["금액·날짜 후보는 제안일 뿐 자동 연결이 아닙니다. 같은 통화와 금액인지 확인한 뒤 자료를 직접 연결하고, 차이는 검토하세요.", "Amount/date candidates are suggestions, not automatic matches. Verify currency and amount, then link sources yourself and review any discrepancy."], ["영수증이 없는 품목은 추정하지 않습니다. 계좌와 분류를 선택하고 맞는 내용만 거래로 저장하세요.", "Items without a receipt are never guessed. Choose an account and category, then save only verified details as a transaction."]],
  },
  overview: {
    title: ["홈", "Home"],
    summary: ["현재 재정 상태와 앞으로의 현금 흐름을 확인하는 시작 화면입니다.", "Your starting point for current finances and upcoming cash flow."],
    steps: [["잔액은 등록 계좌의 시작 잔액과 저장된 수입·지출을 바탕으로 계산됩니다.", "Balances are based on account opening balances and recorded income and spending."], ["잔액 예상 기간을 바꾸어 앞으로의 자금 흐름을 살펴보세요.", "Change the forecast horizon to inspect future cash flow."], ["수입·지출 기록하기는 이미 발생한 거래를, 수입·지출 계획하기는 앞으로 받을 돈이나 낼 돈을 입력합니다.", "Record a transaction that already happened, or create a plan for money expected later."]],
  },
  actuals: {
    title: ["수입·지출 내역", "Transactions"],
    summary: ["이미 받은 수입과 이미 지출한 돈을 기록하고 수정합니다.", "Record and manage income received and spending already paid."],
    steps: [["위 입력 양식에서 날짜, 내용, 금액, 통화, 계좌, 분류를 확인하고 거래를 저장하세요.", "Use the entry form to review date, description, amount, currency, account, and category before saving."], ["영수증이나 명세서 파일은 먼저 미리 보고 검토한 뒤 필요한 내용을 보완해 저장하세요. 가져온 자료가 거래를 자동 확정하지 않습니다.", "Preview receipt or statement imports, review the suggestions, and complete missing details before saving. Imports never confirm transactions automatically."], ["목록 머리글의 정렬 기능과 거래별 수정 동작으로 기존 기록을 관리하세요.", "Use the list sorting controls and each transaction's edit actions to manage saved entries."]],
  },
  plans: {
    title: ["수입·지출 계획", "Income & expense plans"],
    summary: ["아직 실제로 발생하지 않은 예정 수입과 지출을 관리합니다.", "Manage expected income and spending that have not happened yet."],
    steps: [["예정된 날짜와 금액을 입력하세요. 계획은 실제 거래 기록과 별도로 유지됩니다.", "Enter the expected date and amount. Plans remain separate from actual transactions."], ["최초 예상과 최신 예상은 환율이나 예상 비용이 바뀌어도 구분해 확인할 수 있습니다.", "Compare the original and latest estimates when exchange rates or expected costs change."], ["실제 결제가 발생하면 수입·지출 내역에 따로 기록하고 해당 계획과 연결하세요.", "When payment occurs, record it separately in Transactions and link it to the plan."]],
  },
  transfers: {
    title: ["내 계좌 간 이체", "Transfers"],
    summary: ["내가 소유한 계좌 사이에서 이동한 돈을 기록합니다.", "Record money moved between accounts you own."],
    steps: [["보내는 계좌와 받는 계좌, 날짜와 양쪽 금액을 입력하세요.", "Enter the source and destination accounts, date, and amounts on both sides."], ["계좌 간 이동은 새 수입이나 지출로 계산되지 않습니다. 별도 이체 수수료만 비용입니다.", "A transfer is not new income or spending. Only a separately charged fee is an expense."], ["계좌가 다르면 통화와 실제 적용된 환율을 확인하세요.", "If the accounts use different currencies, review the currencies and applied rate."]],
  },
  calendar: {
    title: ["일정 달력", "Calendar"],
    summary: ["예정일과 실제 거래일을 달력에서 함께 살펴봅니다.", "Review planned dates and actual transaction dates on a calendar."],
    steps: [["월 이동 컨트롤로 기간을 바꾸고 날짜별 항목을 확인하세요.", "Use the month controls to change the period and inspect entries by date."], ["예정 항목과 실제 거래는 서로 다른 표시로 나타납니다.", "Planned items and actual transactions are shown as distinct records."], ["달력 항목을 선택해 관련 거래나 계획 페이지에서 자세히 확인하세요.", "Open the related transaction or plan to review its details."]],
  },
  review: {
    title: ["확인할 항목", "Needs attention"],
    summary: ["기한이 지난 계획이나 추가 확인이 필요한 거래를 모아 봅니다.", "Review overdue plans and transactions that need your attention."],
    steps: [["‘확인하기’를 누르면 해당 기록만 노란색으로 강조됩니다. 위 안내에서 확인 사유와 수정 방법을 읽고, 정보 수정 또는 바로 수정을 사용하세요.", "Review opens only the relevant record, highlighted in yellow. Read the reason and instructions, then use Edit details or Edit inline."], ["계획에 연결하지 않은 일반 수입·지출은 문제가 아닙니다. 이 화면은 금액이나 거래를 자동으로 바꾸지 않습니다.", "Ordinary transactions do not need a linked plan. This page never changes amounts or transactions automatically."], ["확인이 끝난 뒤 거래 목록을 새로고침해 최신 상태를 확인하세요.", "Refresh the transaction list after making changes to see the latest state."]],
  },
  reports: {
    title: ["수입·지출 분석", "Income & spending"],
    summary: ["선택한 기간의 실제 수입과 지출을 분류별로 분석합니다.", "Analyze actual income and spending by category for the selected period."],
    steps: [["기간을 선택해 파이 차트와 합계를 확인하세요.", "Choose a period to review the pie chart and totals."], ["분류되지 않은 거래는 임의로 추정하지 않습니다. 거래나 분류 페이지에서 직접 지정하세요.", "Uncategorized entries are not guessed; assign them from Transactions or Categories."], ["서로 다른 통화의 원래 금액은 직접 합산되지 않으며, 표시된 기준 통화 환산액을 확인하세요.", "Original amounts in different currencies are not added together; review the converted reporting-currency totals."]],
  },
  accounts: {
    title: ["내 계좌", "Accounts"],
    summary: ["추적할 현금·은행·카드 계좌와 시작 잔액을 관리합니다.", "Manage the cash, bank, and card accounts you track, including opening balances."],
    steps: [["계좌 이름, 통화, 시작 잔액을 추가하거나 편집하세요.", "Add or edit an account name, currency, and opening balance."], ["계좌를 삭제하면 연결된 거래를 먼저 다른 계좌에 재배정하거나 보완 필요 상태로 옮겨야 합니다.", "Before removing an account, reassign its transactions or move them to Needs completion."], ["시작 잔액은 앱에서 거래 기록을 시작하기 직전의 실제 잔액이어야 합니다.", "The opening balance should match the real balance just before you began recording transactions."]],
  },
  categories: {
    title: ["수입·지출 분류", "Categories"],
    summary: ["분석에 사용할 수입 종류와 지출 분야를 관리합니다.", "Manage income sources and spending categories used in reports."],
    steps: [["새 분류를 추가하거나 이름을 바꾸고 더 이상 쓰지 않는 분류는 비활성화하세요.", "Add categories, rename them, or deactivate ones you no longer use."], ["분류 이름과 수입·지출 구분은 기존 거래 분석에 반영됩니다.", "Category names and income/expense type affect transaction analysis."], ["기존 분류를 정리하기 전에 해당 분류가 연결된 거래를 확인하세요.", "Check which transactions use a category before reorganizing it."]],
  },
  recurring: {
    title: ["정기 수입·지출", "Recurring plans"],
    summary: ["반복되는 일정을 계획 템플릿으로 관리합니다.", "Manage repeated events as plan templates."],
    steps: [["주기, 다음 날짜, 금액 등 반복 정보를 저장하고 필요하면 일시 중지하세요.", "Save the recurrence, next date, and amount; pause it whenever needed."], ["정기 항목 자체는 거래를 만들지 않습니다. 생성된 제안을 확인하고 직접 추가해야 합니다.", "A recurring template does not create transactions. Review and add each proposed plan yourself."], ["실제로 지급하거나 받은 거래는 수입·지출 내역에 별도로 기록하세요.", "Record money actually received or paid separately in Transactions."]],
  },
  export: {
    title: ["자료 다운로드", "Export data"],
    summary: ["내 기록을 보관하거나 다른 도구에서 활용할 수 있도록 내려받습니다.", "Download your records for your own archive or use in another tool."],
    steps: [["필요한 자료의 CSV 다운로드 버튼을 선택하세요.", "Choose the CSV download button for the records you need."], ["내려받은 파일에는 금융 정보가 포함되므로 안전한 개인 위치에 보관하세요.", "Exports contain financial information; store them in a secure private location."], ["파일을 다른 서비스에 올리기 전 개인 정보가 포함됐는지 확인하세요.", "Review exports for personal information before uploading them elsewhere."]],
  },
  settings: {
    title: ["설정", "Settings"],
    summary: ["로그인 방식, 화면 언어, 기준 통화, 안전 잔액, 시간대를 관리합니다.", "Manage sign-in details, language, reporting currency, safety balance, and timezone."],
    steps: [["화면 언어는 현재 브라우저에 저장되며 한국어와 영어 중 선택할 수 있습니다.", "Display language is saved in this browser; choose Korean or English."], ["기준 통화, 최소 유지 잔액, 시간대를 바꾼 뒤 설정 저장을 누르세요.", "Change reporting currency, safety balance, or timezone, then select Save settings."], ["Google 비밀번호는 Google 계정에서 관리합니다. 이메일 로그인 계정은 여기서 재설정 이메일을 요청할 수 있습니다.", "Manage Google passwords in your Google account. For email sign-in, request a reset email here."]],
  },
};

export const userGuideSections = [
  ...workspacePages.filter((page) => page.id !== "drafts").map((page) => page.id),
  "settings",
] as const;

export function getGuideContext(value: string | undefined) {
  return value && value in userGuide ? value : "overview";
}
