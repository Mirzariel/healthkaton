import type { Claim, Confirmation, Dataset, Episode, Evidence, Participant, Service } from "../types";

export interface Ctx {
  ds: Dataset;
  part: Map<string, Participant>;
  ep: Map<string, Episode>;
  claim: Map<string, Claim>;
  claimsByEpisode: Map<string, Claim[]>;
  claimsByParticipant: Map<string, Claim[]>;
  episodesByParticipant: Map<string, Episode[]>;
  servicesByEpisode: Map<string, Service[]>;
  evidenceByEpisode: Map<string, Evidence[]>;
  confByService: Map<string, Confirmation[]>;
}

function group<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function buildCtx(ds: Dataset): Ctx {
  const ep = new Map(ds.episodes.map((e) => [e.id, e]));
  const claimsByEpisode = group(ds.claims, (c) => c.episode_id);
  const claimsByParticipant = group(ds.claims, (c) => ep.get(c.episode_id)!.participant_id);
  return {
    ds,
    part: new Map(ds.participants.map((p) => [p.id, p])),
    ep,
    claim: new Map(ds.claims.map((c) => [c.id, c])),
    claimsByEpisode,
    claimsByParticipant,
    episodesByParticipant: group(ds.episodes, (e) => e.participant_id),
    servicesByEpisode: group(ds.services, (s) => s.episode_id),
    evidenceByEpisode: group(ds.evidence, (e) => e.episode_id),
    confByService: group(ds.confirmations, (c) => c.service_id),
  };
}
