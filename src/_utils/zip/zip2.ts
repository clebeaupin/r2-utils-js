// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";
import * as yauzl from "yauzl";

import { isHTTP } from "../http/UrlUtils";
// import { streamToBufferPromise } from "../stream/BufferUtils";
import { IStreamAndLength, IZip, Zip } from "./zip";
import { HttpZipReader } from "./zip2RandomAccessReader_Http";

const debug = debug_("r2:utils#zip/zip2");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface IStringKeyedObject { [key: string]: any; }

export class Zip2 extends Zip {

    public static async loadPromise(filePath: string): Promise<IZip> {
        if (isHTTP(filePath)) {
            return Zip2.loadPromiseHTTP(filePath);
        }

        return new Promise<IZip>((resolve, reject) => {

            yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zip) => {
                if (err || !zip) {
                    debug("yauzl init ERROR");
                    debug(err);
                    reject(err);
                    return;
                }
                const zip2 = new Zip2(filePath, zip);

                zip.on("error", (erro) => {
                    debug("yauzl ERROR");
                    debug(erro);
                    reject(erro);
                });

                zip.readEntry(); // next (lazyEntries)
                zip.on("entry", (entry) => {
                    // if (/\/$/.test(entry.fileName)) {
                    if (entry.fileName[entry.fileName.length - 1] === "/") {
                        // skip directories / folders
                    } else {
                        // debug(entry.fileName);
                        zip2.addEntry(entry);
                    }
                    zip.readEntry(); // next (lazyEntries)
                });

                zip.on("end", () => {
                    debug("yauzl END");
                    resolve(zip2);
                });

                zip.on("close", () => {
                    debug("yauzl CLOSE");
                });
            });
        });
    }

    private static async loadPromiseHTTP(filePath: string): Promise<IZip> {
        const headResponse = await fetch(filePath, { method: "HEAD" });

        if (!headResponse.ok) {
            throw new Error("Unable to fetch zip file");
        }

        if (!headResponse.headers.has("content-length")) {
            throw new Error("Unable to fetch zip file");
        }

        const httpZipByteLength = parseInt(headResponse.headers.get("content-length") as string, 10);
        debug(`Content-Length: ${httpZipByteLength}`);

        return new Promise((resolve, reject) => {
            const httpZipReader = new HttpZipReader(filePath, httpZipByteLength);
            yauzl.fromRandomAccessReader(httpZipReader, httpZipByteLength,
                { lazyEntries: true, autoClose: false },
                (err, zip) => {
                    if (err || !zip) {
                        debug("yauzl init ERROR");
                        debug(err);
                        reject(err);
                        return;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (zip as any).httpZipReader = httpZipReader;
                    const zip2 = new Zip2(filePath, zip);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    zip.on("error", (erro: any) => {
                        debug("yauzl ERROR");
                        debug(erro);
                        reject(erro);
                    });

                    zip.readEntry(); // next (lazyEntries)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    zip.on("entry", (entry: any) => {
                        if (entry.fileName[entry.fileName.length - 1] === "/") {
                            // skip directories / folders
                        } else {
                            // debug(entry.fileName);
                            zip2.addEntry(entry);
                        }
                        zip.readEntry(); // next (lazyEntries)
                    });

                    zip.on("end", () => {
                        debug("yauzl END");
                        resolve(zip2);
                    });

                    zip.on("close", () => {
                        debug("yauzl CLOSE");
                    });
                });
            });

    }

    private entries: IStringKeyedObject;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private constructor(readonly filePath: string, readonly zip: any) {
        super();

        // see addEntry()
        this.entries = {};
    }

    public freeDestroy(): void {
        debug("freeDestroy: Zip2 -- " + this.filePath);
        if (this.zip) {
            this.zip.close();
        }
    }

    public entriesCount(): number {
        return this.zip.entryCount;
    }

    public hasEntries(): boolean {
        return this.entriesCount() > 0;
    }

    public hasEntry(entryPath: string): boolean {
        return this.hasEntries() && this.entries[entryPath];
    }

    public async getEntries(): Promise<string[]> {

        if (!this.hasEntries()) {
            return Promise.resolve([]);
        }
        return Promise.resolve(Object.keys(this.entries));
    }

    public async entryStreamPromise(entryPath: string): Promise<IStreamAndLength> {

        // debug(`entryStreamPromise: ${entryPath}`);

        if (!this.hasEntries() || !this.hasEntry(entryPath)) {
            return Promise.reject("no such path in zip: " + entryPath);
        }

        const entry = this.entries[entryPath];

        return new Promise<IStreamAndLength>((resolve, reject) => {

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.zip.openReadStream(entry, (err: any, stream: NodeJS.ReadableStream) => {
                if (err) {
                    debug("yauzl openReadStream ERROR");
                    debug(err);
                    reject(err);
                    return;
                }
                const streamAndLength: IStreamAndLength = {
                    length: entry.uncompressedSize as number,
                    reset: async () => {
                        return this.entryStreamPromise(entryPath);
                    },
                    stream,
                };
                resolve(streamAndLength);
            });
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private addEntry(entry: any) {
        this.entries[entry.fileName] = entry;
    }
}
