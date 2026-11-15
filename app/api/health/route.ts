import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({service:"kaam-ki-baat",foundation:"scaffolded",liveIntegrations:{wispr:false,github:false,bolna:false},persistence:false})}
