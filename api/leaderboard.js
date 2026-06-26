import { neon } from "@neondatabase/serverless";

const SHAPES = new Set(["circle", "square", "triangle", "diamond", "hexagon"]);

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function cleanName(value) {
  return String(value || "").normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 18);
}

async function ensureDatabase(sql) {
  await sql`CREATE TABLE IF NOT EXISTS shape_scores (
    id BIGSERIAL PRIMARY KEY,
    shape TEXT NOT NULL CHECK (shape IN ('circle','square','triangle','diamond','hexagon')),
    player_name VARCHAR(18) NOT NULL,
    score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS shape_scores_rank_idx
    ON shape_scores (shape, score DESC, created_at ASC)`;
  await sql`CREATE OR REPLACE FUNCTION submit_shape_score(p_shape TEXT, p_name TEXT, p_score SMALLINT)
    RETURNS TABLE(entered BOOLEAN, reason TEXT, won_tie BOOLEAN, score_id BIGINT)
    LANGUAGE plpgsql AS $$
    DECLARE score_count INTEGER; cutoff SMALLINT; new_id BIGINT; tie_result BOOLEAN := NULL;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('perfect-shapes:' || p_shape));
      SELECT COUNT(*) INTO score_count FROM shape_scores WHERE shape = p_shape;
      SELECT score INTO cutoff FROM shape_scores WHERE shape = p_shape
        ORDER BY score DESC, created_at ASC OFFSET 4 LIMIT 1;
      IF score_count >= 5 AND p_score < cutoff THEN
        RETURN QUERY SELECT FALSE, 'cutoff'::TEXT, NULL::BOOLEAN, NULL::BIGINT; RETURN;
      END IF;
      IF score_count >= 5 AND p_score = cutoff THEN
        tie_result := random() >= 0.5;
        IF NOT tie_result THEN
          RETURN QUERY SELECT FALSE, 'coin-flip'::TEXT, FALSE, NULL::BIGINT; RETURN;
        END IF;
      END IF;
      INSERT INTO shape_scores (shape, player_name, score)
        VALUES (p_shape, p_name, p_score) RETURNING id INTO new_id;
      DELETE FROM shape_scores WHERE id IN (
        SELECT id FROM shape_scores WHERE shape = p_shape
        ORDER BY score DESC, created_at ASC OFFSET 5
      );
      RETURN QUERY SELECT TRUE, NULL::TEXT, tie_result, new_id;
    END;
    $$`;
}

async function leaders(sql, shape) {
  const rows = await sql`SELECT id, player_name AS name, score, created_at
    FROM shape_scores WHERE shape = ${shape}
    ORDER BY score DESC, created_at ASC LIMIT 5`;
  return rows.map((row, index) => ({
    id: String(row.id), rank: index + 1, name: row.name,
    score: Number(row.score), createdAt: row.created_at
  }));
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return send(res, 503, { error: "Leaderboard database is not connected yet." });
  }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await ensureDatabase(sql);
    if (req.method === "GET") {
      const shape = String(req.query.shape || "circle").toLowerCase();
      if (!SHAPES.has(shape)) return send(res, 400, { error: "Unknown shape." });
      return send(res, 200, { shape, leaders: await leaders(sql, shape) });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { error: "Method not allowed." });
    }
    const action = String(req.body?.action || "");
    const shape = String(req.body?.shape || "").toLowerCase();
    const score = Number(req.body?.score);
    if (!SHAPES.has(shape) || !Number.isInteger(score) || score < 0 || score > 100) {
      return send(res, 400, { error: "Invalid score." });
    }
    const current = await leaders(sql, shape);
    const cutoff = current.length < 5 ? null : current[4].score;
    const qualifies = current.length < 5 || score >= cutoff;
    if (action === "qualify") {
      return send(res, 200, { qualifies, tie: qualifies && cutoff !== null && score === cutoff, cutoff });
    }
    if (action !== "submit") return send(res, 400, { error: "Unknown action." });
    const name = cleanName(req.body?.name);
    if (!name) return send(res, 400, { error: "Please enter a name." });
    const result = (await sql`SELECT * FROM submit_shape_score(
      ${shape}, ${name}, ${score}::SMALLINT
    )`)[0];
    const finalLeaders = await leaders(sql, shape);
    if (!result.entered) {
      return send(res, 200, {
        entered: false, reason: result.reason, wonTie: result.won_tie, leaders: finalLeaders
      });
    }
    const rank = finalLeaders.findIndex((entry) => entry.id === String(result.score_id)) + 1;
    return send(res, 201, { entered: true, rank, wonTie: result.won_tie, leaders: finalLeaders });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "The leaderboard had a wobble. Try again." });
  }
}

