import { makeDocument } from '../lib/documents';
export async function readSourceFile(file: File) {
    if (file.size > 5e6)
        throw Error('Maximum document size is 5 MB.');
    let text = '', pages: {
        page: number;
        text: string;
    }[] | undefined;
    if (/\.pdf$/i.test(file.name)) {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
        const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        try {
            const doc = await task.promise;
            if (doc.numPages > 40)
                throw Error('PDF limit is 40 pages.');
            pages = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const content = await (await doc.getPage(i)).getTextContent();
                const pageText = content.items.map(item => 'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '').join('');
                pages.push({ page: i, text: pageText });
            }
            text = pages.map(p => p.text).join('\n');
        }
        finally {
            await task.destroy();
        }
        if (text.trim().length < 20)
            throw Error('This PDF needs OCR. Upload a text-based PDF or a text transcript.');
    }
    else if (/\.(txt|csv|md|json)$/i.test(file.name))
        text = await file.text();
    else
        throw Error('Supported: text-based PDF, TXT, CSV, MD, JSON.');
    return makeDocument(file.name, text, pages);
}
