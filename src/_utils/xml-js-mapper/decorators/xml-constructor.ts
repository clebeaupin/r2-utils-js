// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import { getDefinition } from "../classes/object-definition";

export function XmlConstructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target: any, key: string): void => {
        const definition = getDefinition(target.constructor);

        definition.ctr = target[key];
    };
}
