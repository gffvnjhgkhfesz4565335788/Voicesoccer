import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { ErrorResponse, HealthStatus, TokenRequest, TokenResponse } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns server health status
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateGeminiLiveTokenUrl: () => string;
/**
 * Creates a short-lived ephemeral token for connecting to the Gemini Live API directly from the browser
 * @summary Create ephemeral token
 */
export declare const createGeminiLiveToken: (tokenRequest?: TokenRequest, options?: RequestInit) => Promise<TokenResponse>;
export declare const getCreateGeminiLiveTokenMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createGeminiLiveToken>>, TError, {
        data?: BodyType<TokenRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createGeminiLiveToken>>, TError, {
    data?: BodyType<TokenRequest>;
}, TContext>;
export type CreateGeminiLiveTokenMutationResult = NonNullable<Awaited<ReturnType<typeof createGeminiLiveToken>>>;
export type CreateGeminiLiveTokenMutationBody = BodyType<TokenRequest> | undefined;
export type CreateGeminiLiveTokenMutationError = ErrorType<ErrorResponse>;
/**
* @summary Create ephemeral token
*/
export declare const useCreateGeminiLiveToken: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createGeminiLiveToken>>, TError, {
        data?: BodyType<TokenRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createGeminiLiveToken>>, TError, {
    data?: BodyType<TokenRequest>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map