import { useState } from "react";
import { ArrowRightLeft, BriefcaseBusiness, Check, ClipboardList, Coins, Sparkles } from "lucide-react";
import { displayName } from "../format";
import { useSimulator } from "../simulator-context";

export function MarketView() {
  const { current, move, createOffseason, acceptOffseason, confirm } = useSimulator();
  const [driverId, setDriverId] = useState(current?.season.drivers[0]?.id ?? "");
  const [teamId, setTeamId] = useState(current?.season.teams[0]?.id ?? "");
  const [seat, setSeat] = useState<0 | 1>(1);
  if (!current) return null;
  const season = current.season;
  const contracts = [...season.contracts].sort((a, b) => b.salaryCredits - a.salaryCredits);
  const activeIds = new Set(season.teams.flatMap((team) => team.driverIds));
  const freeAgents = season.drivers.filter((driver) => !activeIds.has(driver.id));
  const rookiePool = freeAgents.filter((driver) => driver.evidence.source === "Generated rookie pool");

  return (
    <div className="page-stack">
      <header className="page-heading"><span>Driver market</span><h1>Contracts, seats, leverage</h1><p>Values use era-adjusted credits. AI teams negotiate; race control can override any agreement at a legal boundary.</p></header>
      <section className="transfer-console">
        <div className="section-heading"><div><span>Race-director override</span><h2>Move a driver</h2></div><ArrowRightLeft /></div>
        <div className="transfer-line">
          <label>Driver<select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <optgroup label="Active grid">{season.drivers.filter((driver) => activeIds.has(driver.id)).map((driver) => { const team = season.teams.find((candidate) => candidate.driverIds.includes(driver.id)); return <option value={driver.id} key={driver.id}>{displayName(driver)} · {team?.shortName ?? driver.code}</option>; })}</optgroup>
            {freeAgents.length > 0 && <optgroup label="Free agents / rookies">{freeAgents.map((driver) => <option value={driver.id} key={driver.id}>{driver.evidence.source === "Generated rookie pool" ? "Rookie · " : "Free agent · "}{displayName(driver)} · {driver.code}</option>)}</optgroup>}
          </select></label>
          <label>Destination<select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{season.teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
          <label>Seat<select value={seat} onChange={(event) => setSeat(Number(event.target.value) as 0 | 1)}><option value={0}>Seat 1</option><option value={1}>Seat 2</option></select></label>
          <button className="button button--dark" disabled={season.phase === "session"} onClick={() => void confirm({ title: "Commit this driver move?", message: "The transfer will take effect at the next stable weekend boundary.", confirmLabel: "Commit move" }).then((approved) => { if (approved) void move(driverId, teamId, seat); })}>Commit move</button>
        </div>
      </section>

      <section className="data-section rookie-pool">
        <div className="section-heading"><div><span>Talent pipeline</span><h2>Free-agent rookie pool</h2></div><Sparkles /></div>
        <p className="section-note">Rookies are generated at an approved offseason and remain unattached until you place them into a seat. Potential is their growth ceiling, not a promise of pace.</p>
        {rookiePool.length === 0 ? <p className="empty-note">No generated rookies are waiting for a seat yet. Complete a dynasty season and approve its offseason package.</p> : <div className="rookie-grid">{rookiePool.map((rookie) => <article key={rookie.id}><div><strong>{displayName(rookie)}</strong><small>{rookie.code} · age {rookie.age} · {rookie.nationality}</small></div><span><b>{rookie.ratings.racePace}</b> pace <b>{rookie.potential}</b> potential</span></article>)}</div>}
        {freeAgents.filter((driver) => driver.evidence.source !== "Generated rookie pool").length > 0 && <p className="free-agent-note">{freeAgents.filter((driver) => driver.evidence.source !== "Generated rookie pool").length} reserve/free-agent driver{freeAgents.filter((driver) => driver.evidence.source !== "Generated rookie pool").length === 1 ? "" : "s"} also available.</p>}
      </section>

      <div className="market-layout">
        <section className="data-section contract-ledger">
          <div className="section-heading"><div><span>Active agreements</span><h2>Contract ledger</h2></div><BriefcaseBusiness /></div>
          <div className="data-table">
            <div className="data-row data-row--head"><span>Driver</span><span>Team</span><span>Role</span><span>Term</span><span>Status</span><span>Salary</span></div>
            {contracts.map((contract) => {
              const driver = season.drivers.find((item) => item.id === contract.driverId);
              const team = season.teams.find((item) => item.id === contract.teamId);
              return <div className="data-row" key={contract.id}><strong>{driver?.code}</strong><span>{team?.shortName}</span><span>{contract.role}</span><span>{contract.startSeason}–{contract.endSeason}</span><span className={`contract-status contract-status--${contract.status}`}>{contract.status}</span><span className="credit"><Coins /> {contract.salaryCredits.toLocaleString()}</span></div>;
            })}
          </div>
        </section>

        <aside className="offseason-desk">
          <div className="section-heading"><div><span>Dynasty control</span><h2>Offseason package</h2></div><ClipboardList /></div>
          {current.mode !== "dynasty" ? <p className="empty-note">This universe is a standalone season. Offseason evolution is disabled.</p> : season.offseasonProposal ? <>
            <span className="proposal-year">{season.offseasonProposal.targetSeason}</span>
            <p>{season.offseasonProposal.summary}</p>
            <ul>{season.offseasonProposal.driverMoves.map((item) => <li key={`${item.driverId}-${item.toTeamId}`}>{season.drivers.find((driver) => driver.id === item.driverId)?.familyName} proposed to {season.teams.find((team) => team.id === item.toTeamId)?.name}</li>)}{season.offseasonProposal.ratingChanges.filter((item) => item.delta !== 0).slice(0, 5).map((item) => <li key={`${item.teamId}-${item.field}`}>{season.teams.find((team) => team.id === item.teamId)?.shortName}: {item.field} {item.delta > 0 ? "+" : ""}{item.delta}</li>)}{(season.offseasonProposal.rookies ?? []).map((rookie) => <li key={rookie.id}>Rookie pool: {displayName(rookie)} (potential {rookie.potential})</li>)}</ul>
            <button className="button button--signal button--full" onClick={() => void acceptOffseason()}><Check /> Approve package</button>
          </> : <><Sparkles className="proposal-icon" /><p>Complete the current season, then let the market propose transfers, development, rules, and calendar changes for review.</p><button className="button button--dark button--full" disabled={season.phase !== "season-complete"} onClick={() => void createOffseason()}>Generate proposal</button></>}
        </aside>
      </div>
    </div>
  );
}
