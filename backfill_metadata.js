const fs = require("fs");
const path = require("path");
const { getAllJobs, updateJob } = require("./src/database");
const config = require("./src/config");

async function backfill() {
    const jobs = getAllJobs();
    console.log(`Checking ${jobs.length} jobs for metadata...`);

    for (const job of jobs) {
        if (job.video_path && fs.existsSync(job.video_path)) {
            const thumbPath = job.video_path.replace(".mp4", ".jpg");
            const txtPath = job.video_path.replace(".mp4", ".txt");

            const updates = {};

            if (fs.existsSync(thumbPath)) {
                updates.thumbnail_path = thumbPath;
            }

            if (fs.existsSync(txtPath)) {
                const content = fs.readFileSync(txtPath, "utf-8");
                const lines = content.split("\n");
                lines.forEach(line => {
                    if (line.startsWith("Description: ")) {
                        updates.video_description = line.replace("Description: ", "").trim();
                    } else if (line.startsWith("Tags: ")) {
                        updates.video_tags = line.replace("Tags: ", "").trim();
                    }
                });
            }

            if (Object.keys(updates).length > 0) {
                console.log(`Updating Job ${job.id} with metadata...`);
                updateJob(job.id, updates);
            }
        }
    }

    console.log("Backfill complete.");
    process.exit(0);
}

backfill();
