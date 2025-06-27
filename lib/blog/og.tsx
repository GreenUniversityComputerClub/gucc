import React from 'react';
import { ImageResponse } from '@vercel/og';
import fs from 'fs';
import path from 'path';
import { Post } from '@/app/blog/types';

export async function generateOGImage(props: { post: Post; outputPath: string }) {
  const post = props.post;

  try {
    const image = new ImageResponse(
      (
        <div
          style={{
            fontFamily: 'Inter',
            height: '100%',
            width: '100%',
            display: 'flex',
            // border: '10px solid white',
            // borderRadius: '10px',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'black',
            padding: '128px',
          }}
        >
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '58px',
              justifyContent: 'space-between',
            }}
          >
            <h1
              style={{
                fontSize: '98px',
                fontWeight: 'bold',
                color: 'white',
                lineHeight: 1.1,
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              {props.post.title}
            </h1>

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                color: '#888',
                // gap: '12px',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                fontSize: '48px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  color: '#888',
                  gap: '12px',
                  fontSize: '32px',
                }}
              >
                {post.publishedAt && (
                  <span style={{ order: '1' }}>
                    {new Date(post.publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
                <span style={{ order: '2' }}>·</span>
                <span style={{ order: '3' }}>{post.readTimeInMinutes} min read</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: '12px',
                }}
              >
                <img
                  src="https://github.com/nurulhudaapon.png"
                  width="80"
                  height="80"
                  style={{
                    borderRadius: '50%',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'white', fontSize: '30px' }}>{props.post.author.name}</span>
                  <span style={{ fontSize: '24px', color: '#888' }}>{'nurulhudaapon.com'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );

    // Ensure the output directory exists
    const dir = path.dirname(props.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert the image to a buffer and save it
    const buffer = await image.arrayBuffer();
    fs.writeFileSync(props.outputPath, Buffer.from(buffer));
  } catch (error) {
    console.error(`Failed to generate OG image for ${props.post.title}:`, error);
  }
}
