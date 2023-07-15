// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";

import { PassThrough } from "stream";
import * as yauzl from "yauzl";
import { bufferToStream } from "../stream/BufferUtils";

const debug = debug_("r2:utils#zip/zip2RandomAccessReader_Http");

// import * as util from "util";
// export interface RandomAccessReader {
//     _readStreamForRange(start: number, end: number): void;
// }

// YAUZL:
// export abstract class RandomAccessReader extends EventEmitter {
//     _readStreamForRange(start: number, end: number): void;
//     createReadStream(options: { start: number; end: number }): void;
//     read(buffer: Buffer, offset: number, length: number, position: number, callback: (err?: Error) => void): void;
//     close(callback: (err?: Error) => void): void;
// }

const MAX_FIRST_BUFFER_SIZE = 200 * 1024; // 200K

export class HttpZipReader extends yauzl.RandomAccessReader {
    private firstBuffer: Buffer | undefined = undefined;
    private firstBufferStart = 0;
    private firstBufferEnd = 0;

    constructor(readonly url: string, readonly byteLength: number) {
        super();
        // yauzl.RandomAccessReader.call(this);
    }

    public _readStreamForRange(start: number, end: number) {
        const stream = new PassThrough();

        if (this.firstBuffer && start >= this.firstBufferStart && end <= this.firstBufferEnd) {
            const begin = start - this.firstBufferStart;
            const stop = end - this.firstBufferStart;
            return bufferToStream(this.firstBuffer.slice(begin, stop));
        }

        const length = end - start;

        const lastByteIndex = end - 1;
        const range = `${start}-${lastByteIndex}`;

        const failure = (err: unknown) => {
            debug(err as string);
            stream.end();
        };

        const success = async (response: Response) => {
            if (!response.ok) {
                failure("HTTP CODE " + response.status);
                return;
            }

            if (!(response.body instanceof ReadableStream)) {
                failure("Body is not readable");
                return;
            }

            if (length > MAX_FIRST_BUFFER_SIZE) {
                // Do not put in memory buffer
                const reader = (response.body).getReader();
                let readResult = await reader.read();

                while (!readResult.done) {
                    const buffer = Buffer.from(readResult.value);
                    stream.write(buffer);
                    readResult = await reader.read();
                }
            } else {
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                if (this.firstBuffer == null) {
                    this.firstBuffer = buffer;
                    this.firstBufferStart = start;
                    this.firstBufferEnd = end;
                }
                stream.write(buffer);
            }

            stream.end();
        };

        debug(`_readStreamForRange (new HttpReadableStream) ${this.url}` +
        ` content-length=${this.byteLength} start=${start} end+1=${end} (length=${length})`);

        fetch(this.url, {
            headers: { Range: `bytes=${range}` },
            method: "GET",
        }).then(async (response) => {
                try {
                    await success(response);
                }
                catch (successError) {
                    failure(successError);
                    return;
                }
            })
            .catch((error) => {
                failure(error);
            });


        return stream;
    }
}
