const express = require('express');
const WebTorrent = require('webtorrent');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const client = new WebTorrent();
app.use(cors());

app.get('/stream', (req, res) => {
    const magnetURI = req.query.magnet;
    if (!magnetURI) return res.status(400).send('Missing magnet link');

    client.add(magnetURI, (torrent) => {
        // Find any video file in the torrent
        const file = torrent.files.find(f => 
            f.name.endsWith('.mp4') || 
            f.name.endsWith('.mkv') || 
            f.name.endsWith('.webm') || 
            f.name.endsWith('.avi')
        );
        
        if (!file) return res.status(404).send('No video file found in torrent');

        console.log(`Streaming file: ${file.name}`);

        // If it's an MP4, stream it directly with range support
        if (file.name.endsWith('.mp4')) {
            const range = req.headers.range;
            if (!range) {
                res.writeHead(200, {
                    'Content-Length': file.length,
                    'Content-Type': 'video/mp4',
                });
                return file.createReadStream().pipe(res);
            }

            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
            const chunksize = (end - start) + 1;
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${file.length}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            });
            return file.createReadStream({ start, end }).pipe(res);
        } 
        
        // If it's MKV, AVI, or another format, transcode it on-the-fly to MP4 using FFmpeg
        else {
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
            });

            const stream = file.createReadStream();

            ffmpeg(stream)
                .videoCodec('libx264')
                .audioCodec('aac')
                .format('mp4')
                .outputOptions(['-movflags frag_keyint+empty_moov', '-preset ultrafast', '-tune zerolatency'])
                .on('error', (err) => {
                    console.error('FFmpeg transcoding error: ', err.message);
                })
                .pipe(res, { end: true });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
