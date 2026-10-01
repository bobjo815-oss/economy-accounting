export const workspacePages = [
  { id: "drafts", ko: "보완 필요 거래", en: "Needs completion", group: "record", navigation: false, descriptionKo: "저장된 기록에서 필요한 정보만 보완하고 수입·지출 내역에 반영하세요.", descriptionEn: "Complete missing details in saved entries, then post them to Transactions." },
  { id: "overview", ko: "홈", en: "Home", group: "overview", descriptionKo: "현재 잔액과 앞으로 필요한 돈을 한눈에 확인하세요.", descriptionEn: "See your balances and upcoming cash needs at a glance." },
  { id: "actuals", ko: "수입·지출 내역", en: "Transactions", group: "record", descriptionKo: "이미 들어오거나 나간 돈을 기록하고 확인하세요.", descriptionEn: "Record money you have received or spent." },
  { id: "plans", ko: "수입·지출 계획", en: "Income & expense plans", group: "record", descriptionKo: "아직 받거나 내지 않은 돈을 날짜별로 계획하세요.", descriptionEn: "Plan money you expect to receive or pay, before it happens." },
  { id: "transfers", ko: "내 계좌 간 이체", en: "Transfers", group: "record", descriptionKo: "내 계좌 사이에서 옮긴 돈을 기록하세요. 수입이나 지출과는 구분합니다.", descriptionEn: "Record money moved between your own accounts, separate from income and spending." },
  { id: "calendar", ko: "일정 달력", en: "Calendar", group: "track", descriptionKo: "예정일과 실제 거래일을 월별로 살펴보세요.", descriptionEn: "See upcoming payments and recorded transactions by month." },
  { id: "review", ko: "확인할 항목", en: "Needs attention", group: "track", descriptionKo: "예정일이 지난 계획, 바뀐 예상 금액, 미완성 수정안을 확인하세요. 각 항목에서 확인 사유와 수정 방법을 안내합니다.", descriptionEn: "Review overdue plans, changed estimates and unfinished corrections. Each item explains what to check and how to edit it." },
  { id: "reports", ko: "수입·지출 분석", en: "Income & spending", group: "track", descriptionKo: "수입 종류와 지출 분야를 월별로 살펴보세요.", descriptionEn: "See income sources and spending areas by month." },
  { id: "accounts", ko: "내 계좌", en: "Accounts", group: "manage", descriptionKo: "관리할 계좌와 기록을 시작할 때의 잔액을 등록하세요.", descriptionEn: "Add the accounts you track and their balances when you start recording." },
  { id: "categories", ko: "수입·지출 분류", en: "Categories", group: "manage", descriptionKo: "생활비, 등록금 등 내가 쓰는 이름으로 분류를 만드세요.", descriptionEn: "Organize entries with familiar labels, such as groceries or tuition." },
  { id: "recurring", ko: "정기 수입·지출", en: "Recurring plans", group: "manage", descriptionKo: "월세처럼 반복되는 항목을 저장하세요. 다음 일정은 직접 확인한 뒤 추가됩니다.", descriptionEn: "Save repeating items, such as rent. Add each proposed payment only after reviewing it." },
  { id: "export", ko: "자료 다운로드", en: "Export data", group: "manage", descriptionKo: "내 기록을 CSV 파일로 내려받으세요. 파일은 개인적으로 보관하세요.", descriptionEn: "Download your records as CSV files and keep them private." },
] as const;
export type WorkspaceSection = typeof workspacePages[number]["id"];
export function isWorkspaceSection(value: string): value is WorkspaceSection {
  return workspacePages.some((page) => page.id === value);
}
export function workspaceHref(section: WorkspaceSection) {
  return section === "overview" ? "/workspace" : `/workspace/${section}`;
}
