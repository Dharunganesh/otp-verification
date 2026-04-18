require("regenerator-runtime/runtime");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "certificates";
const TABLE = process.env.SUPABASE_CERTIFICATE_TABLE || "certificate_files";

/** How old a row must be before deletion (default 1 hour). Override with CERTIFICATE_CLEANUP_EXPIRY_MS */
const EXPIRY_MS = Number(process.env.CERTIFICATE_CLEANUP_EXPIRY_MS) || 60 * 60 * 1000;

const PAGE_SIZE = 500;
const STORAGE_REMOVE_BATCH = 100;

function extractStoragePath(publicUrl, bucket) {
  if (!publicUrl || typeof publicUrl !== "string") return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

async function cleanup() {
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();
  let totalDeleted = 0;

  try {
    for (;;) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("id, file, created_at")
        .lt("created_at", cutoff)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);

      if (error) throw error;
      if (!data || data.length === 0) {
        if (totalDeleted === 0) console.log("No old files to delete");
        else console.log(`Cleanup finished ✅ (${totalDeleted} rows removed)`);
        return;
      }

      const paths = [];
      const rowsWithPath = [];

      for (const row of data) {
        const path = extractStoragePath(row.file, BUCKET);
        if (path) {
          paths.push(path);
          rowsWithPath.push(row);
        } else {
          console.warn(`Could not parse storage path for id=${row.id}, skipping storage remove`);
        }
      }

      if (paths.length > 0) {
        for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
          const chunk = paths.slice(i, i + STORAGE_REMOVE_BATCH);
          const { error: storageError } = await supabase.storage.from(BUCKET).remove(chunk);
          if (storageError) throw storageError;
        }
      }

      const ids = data.map((row) => row.id);
      const { error: dbError } = await supabase.from(TABLE).delete().in("id", ids);
      if (dbError) throw dbError;

      totalDeleted += data.length;
      console.log(`Deleted batch of ${data.length} (total so far: ${totalDeleted})`);

      if (data.length < PAGE_SIZE) break;
    }

    console.log("Cleanup successful ✅");
  } catch (err) {
    console.error("Cleanup failed ❌", err.message);
    process.exit(1);
  }
}

cleanup();
