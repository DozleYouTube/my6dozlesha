const API_KEY = process.argv[2];
if (!API_KEY) { console.error("使い方: node fetch_videos.js YOUR_API_KEY"); process.exit(1); }

const CHANNEL_ID = "UCj4PjeVMnNTHIR5EeoNKPAw";
const PUBLISHED_AFTER = new Date("2021-01-01T00:00:00Z");

async function getUploadsPlaylistId() {
  const params = new URLSearchParams({ part: "contentDetails", id: CHANNEL_ID, key: API_KEY });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
  const data = await res.json();
  if (data.error) { console.error("APIエラー:", data.error.message); process.exit(1); }
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function save(videos) {
  const fs = await import('fs');
  const output = { updatedAt: new Date().toISOString(), total: videos.length, videos };
  fs.writeFileSync("videos.json", JSON.stringify(output, null, 2), "utf-8");
  console.log(`→ videos.json に${videos.length}件を保存しました`);
}

async function fetchAllVideos() {
  console.log("uploadsプレイリストIDを取得中...");
  const playlistId = await getUploadsPlaylistId();

  let allVideos = [];
  let pageToken = null;
  let page = 1;

  try {
    do {
      const params = new URLSearchParams({
        part: "snippet", playlistId, maxResults: 50, key: API_KEY,
        ...(pageToken ? { pageToken } : {})
      });

      const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
      const data = await res.json();

      if (data.error) {
        console.error(`ページ${page}でAPIエラー:`, data.error.message);
        console.log("途中まで保存します...");
        await save(allVideos);
        process.exit(0);
      }

      const videos = data.items
        .filter(item => new Date(item.snippet.publishedAt) >= PUBLISHED_AFTER && item.snippet.resourceId?.videoId)
        .map(item => ({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${item.snippet.resourceId.videoId}/mqdefault.jpg`,
          publishedAt: item.snippet.publishedAt,
        }));

      allVideos = allVideos.concat(videos);
      pageToken = data.nextPageToken || null;
      console.log(`ページ${page}: ${data.items.length}件処理 (累計: ${allVideos.length}件)`);
      page++;

      if (pageToken) await new Promise(r => setTimeout(r, 200));
    } while (pageToken);

    await save(allVideos);
    console.log("完了！videos.json を public/ フォルダに置いてGitHubにpush");
  } catch (e) {
    console.error("エラー:", e.message);
    console.log("途中まで保存します...");
    await save(allVideos);
  }
}

fetchAllVideos();
