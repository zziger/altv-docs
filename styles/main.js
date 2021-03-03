// Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license. See LICENSE file in the project root for full license information.

function toggleMenu() {
    const x = document.getElementsByClassName("main-panel")[0];
    const b = document.getElementById("blackout");

    if (x.classList.contains("expand"))
    {
        x.classList.remove("expand");
        b.classList.remove("showThat");
        b.classList.add("hideThat");
    } 
    else 
    {
        x.classList.add("expand");
        b.classList.remove("hideThat");
        b.classList.add("showThat");
    }
}
