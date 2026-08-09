import { UploadDropzone } from "@/components/upload-dropzone";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Upload an asset</h1>
      <p className="mt-1 text-sm text-slate-400">
        Image or PDF. We&apos;ll extract the text, run every check and return a
        proof report in seconds.
      </p>
      <div className="mt-6">
        <UploadDropzone />
      </div>
    </div>
  );
}
