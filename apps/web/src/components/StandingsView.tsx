import { Trophy } from "lucide-react";
import { getChampionshipClinch } from "@f1-sim/core";
import { useSimulator } from "../simulator-context";
import { displayName } from "../format";

export function StandingsView() {
  const { current } = useSimulator();
  if (!current) return null;
  const season = current.season;
  const clinch = getChampionshipClinch(season);
  const wdcLeader = season.drivers.find((driver) => driver.id === clinch.wdc.leaderId);
  const wccLeader = season.teams.find((team) => team.id === clinch.wcc.leaderId);
  return (
    <div className="page-stack">
      <header className="page-heading"><span>Classification</span><h1>{season.year} championship</h1><p>Ties resolve by wins, then countback through each finishing position.</p></header>
      <section className="clinch-grid" aria-label="Championship clinch status">
        <article className={clinch.wdc.clinched ? "clinch-card clinch-card--locked" : "clinch-card"}><span>WDC · drivers</span><strong>{clinch.wdc.clinched ? `${displayName(wdcLeader)} has clinched` : "WDC remains open"}</strong><small>{clinch.wdc.clinched ? "The points table can no longer be overtaken." : `${clinch.wdc.maximumRivalPoints - clinch.wdc.leaderPoints + 1} points still separate the leader from a mathematical clinch.`}</small></article>
        <article className={!season.ruleset.constructorsChampionship ? "clinch-card clinch-card--muted" : clinch.wcc.clinched ? "clinch-card clinch-card--locked" : "clinch-card"}><span>WCC · constructors</span><strong>{!season.ruleset.constructorsChampionship ? "Not awarded in this era" : clinch.wcc.clinched ? `${wccLeader?.name ?? "The leader"} has clinched` : "WCC remains open"}</strong><small>{!season.ruleset.constructorsChampionship ? "This ruleset tracks teams without awarding an official constructors’ title." : clinch.wcc.clinched ? "No remaining weekend can change the constructors’ champion." : `${clinch.wcc.maximumRivalPoints - clinch.wcc.leaderPoints + 1} points still separate the leader from a mathematical clinch.`}</small></article>
      </section>
      <div className="standings-layout">
        <section className="data-section">
          <div className="section-heading"><div><span>World championship</span><h2>Drivers</h2></div><Trophy /></div>
          <div className="data-table standings-table">
            <div className="data-row data-row--head"><span>Pos</span><span>Driver</span><span>Team</span><span>Wins</span><span>Podiums</span><span>Points</span></div>
            {season.driverStandings.map((standing, index) => {
              const driver = season.drivers.find((item) => item.id === standing.driverId);
              const team = season.teams.find((item) => item.driverIds.includes(standing.driverId));
              return <div className="data-row" key={standing.driverId}><b>{index + 1}</b><span className="driver-cell"><i style={{ background: team?.color }} /><strong>{displayName(driver)}</strong><small>#{driver?.number} · {driver?.code}</small></span><span>{team?.name ?? "Free agent"}</span><span>{standing.wins}</span><span>{standing.podiums}</span><strong>{standing.points}</strong></div>;
            })}
          </div>
        </section>
        <section className="data-section">
          <div className="section-heading"><div><span>Constructors</span><h2>{season.ruleset.constructorsChampionship ? "Teams" : "Not awarded in this era"}</h2></div></div>
          {season.ruleset.constructorsChampionship ? <div className="constructor-list">{season.teamStandings.map((standing, index) => { const team = season.teams.find((item) => item.id === standing.teamId); return <div key={standing.teamId}><b>{index + 1}</b><i style={{ background: team?.color }} /><span><strong>{team?.name}</strong><small>{standing.wins} wins</small></span><em>{standing.points} pts</em></div>; })}</div> : <p className="empty-note">Team performance is tracked for reference, but no constructors’ title is awarded by this ruleset.</p>}
        </section>
      </div>
    </div>
  );
}
