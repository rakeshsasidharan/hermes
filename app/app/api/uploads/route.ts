import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getS3() {
  return new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const entry = formData.get('file');
  if (!(entry instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
  }

  const file = entry as File;
  const filename = file.name ?? 'upload';
  const contentType = file.type || 'application/octet-stream';
  const size = file.size;
  const id = crypto.randomUUID();
  const s3Key = `uploads/${id}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  await getS3().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
    ContentLength: size,
  }));

  return NextResponse.json({ s3Key, filename, size, contentType }, { status: 201 });
}