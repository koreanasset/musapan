import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

const PAGE_SIZE = 30;
const MARKET_TABS = ["전체", "코스피", "코스닥"];

const COLUMNS = [
  { key: "stk_nm", label: "종목명", sortable: false, align: "text-left" },
  { key: "cur_prc", label: "현재가", sortable: true, align: "text-right" },
  { key: "pred_pre", label: "전일대비", sortable: true, align: "text-right" },
  { key: "flu_rt", label: "등락률", sortable: true, align: "text-right" },
  { key: "trde_qty", label: "거래량", sortable: true, align: "text-right" },
];

function fmtInt(n) {
  return Number(n || 0).toLocaleString();
}

function ChangeCell({ pred_pre, flu_rt }) {
  const dir = pred_pre > 0 ? "up" : pred_pre < 0 ? "down" : "flat";
  const color = dir === "up" ? "text-red-600" : dir === "down" ? "text-blue-600" : "text-gray-400";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "-";
  return { color, arrow };
}

export default function StockQuotes() {
  const [market, setMarket] = useState("전체");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortField, setSortField] = useState("trde_qty");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("stock_quotes").select("*", { count: "exact" });
    if (market !== "전체") q = q.eq("market", market);
    if (search.trim()) q = q.ilike("stk_nm", `%${search.trim()}%`);
    q = q.order(sortField, { ascending: sortDir === "asc" }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count } = await q;
    setRows(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [market, search, sortField, sortDir, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from("stock_quotes").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setUpdatedAt(data.updated_at); });
  }, []);

  // Any filter/sort change should snap back to page 1, not stay on a page
  // number that may no longer exist for the new result set.
  useEffect(() => { setPage(0); }, [market, search, sortField, sortDir]);

  function toggleSort(key) {
    if (sortField === key) {
      setSortDir(d => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(key);
      setSortDir("desc");
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        코스피, 코스닥 전 종목의 오늘자 현재가·전일대비·등락률·거래량을 장 마감 후 매일 업데이트합니다. 종목명으로 검색하거나 컬럼을 눌러 정렬할 수 있어요.
      </p>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex gap-1.5">
          {MARKET_TABS.map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`text-xs px-2.5 py-1 rounded-full ${market === m ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"}`}
            >
              {m}
            </button>
          ))}
        </div>
        {updatedLabel && <p className="text-xs text-gray-400">{updatedLabel} 장 마감 기준</p>}
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput); }}
          onBlur={() => setSearch(searchInput)}
          placeholder="종목명 검색"
          className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-indigo-400"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-100 text-gray-400">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`py-2 px-3 font-medium ${col.align} ${col.sortable ? "cursor-pointer select-none hover:text-gray-600" : ""}`}
                >
                  {col.label}{sortField === col.key ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLUMNS.length} className="text-center text-gray-300 py-10 text-sm">불러오는 중...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="text-center text-gray-300 py-10 text-sm">검색 결과가 없습니다.</td></tr>
            ) : (
              rows.map(r => {
                const { color, arrow } = ChangeCell(r);
                return (
                  <tr key={r.stk_cd} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <span className="font-medium">{r.stk_nm}</span>
                      <span className="text-[11px] text-gray-300 ml-1.5">{r.market}</span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtInt(r.cur_prc)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${color}`}>{arrow} {fmtInt(Math.abs(r.pred_pre))}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${color}`}>{r.flu_rt > 0 ? "+" : ""}{r.flu_rt}%</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtInt(r.trde_qty)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-center gap-3 mt-3 text-sm text-gray-500">
          <button onClick={() => setPage(0)} disabled={page === 0} className="disabled:opacity-30 hover:text-indigo-600">처음</button>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="disabled:opacity-30 hover:text-indigo-600">이전</button>
          <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="disabled:opacity-30 hover:text-indigo-600">다음</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="disabled:opacity-30 hover:text-indigo-600">마지막</button>
        </div>
      )}
    </div>
  );
}
