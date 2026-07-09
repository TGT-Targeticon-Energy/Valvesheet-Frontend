/**
 * React Query hooks for Valve Datasheet API
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, {
  type DecodedVDS,
  type ValidationResult,
  type DatasheetResponse,
  type FlatDatasheetResponse,
  type MetadataResponse,
  type VDSListResponse,
  type BatchResponse,
  type HealthResponse,
} from "@/services/api";

// === Query Keys ===

export const queryKeys = {
  health: ["health"] as const,
  metadata: ["metadata"] as const,
  valveTypes: ["metadata", "valve-types"] as const,
  pipingClasses: ["metadata", "piping-classes"] as const,
  endConnections: ["metadata", "end-connections"] as const,
  boreTypes: ["metadata", "bore-types"] as const,
  vdsNumbers: (params?: { limit?: number; offset?: number; valve_type?: string }) =>
    ["metadata", "vds-numbers", params] as const,
  decode: (vdsNo: string) => ["vds", "decode", vdsNo] as const,
  validate: (vdsNo: string) => ["vds", "validate", vdsNo] as const,
  datasheet: (vdsNo: string) => ["datasheet", vdsNo] as const,
  datasheetFlat: (vdsNo: string) => ["datasheet", "flat", vdsNo] as const,
};

// === Health Check ===

export function useHealthCheck() {
  return useQuery<HealthResponse>({
    queryKey: queryKeys.health,
    queryFn: api.checkHealth,
    staleTime: 30000, // 30 seconds
    retry: 1,
  });
}

// === Metadata Hooks ===

export function useMetadata() {
  return useQuery<MetadataResponse>({
    queryKey: queryKeys.metadata,
    queryFn: api.getMetadata,
    staleTime: 5 * 60 * 1000, // 5 minutes - metadata doesn't change often
  });
}

export function useValveTypes() {
  return useQuery({
    queryKey: queryKeys.valveTypes,
    queryFn: api.getValveTypes,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePipingClasses() {
  return useQuery({
    queryKey: queryKeys.pipingClasses,
    queryFn: api.getPipingClasses,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEndConnections() {
  return useQuery({
    queryKey: queryKeys.endConnections,
    queryFn: api.getEndConnections,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBoreTypes() {
  return useQuery({
    queryKey: queryKeys.boreTypes,
    queryFn: api.getBoreTypes,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVDSNumbers(params?: { limit?: number; offset?: number; valve_type?: string }) {
  return useQuery<VDSListResponse>({
    queryKey: queryKeys.vdsNumbers(params),
    queryFn: () => api.getVDSNumbers(params),
    staleTime: 60 * 1000, // 1 minute
  });
}

// === VDS Operations ===

export function useDecodeVDS(vdsNo: string, enabled = true) {
  return useQuery<DecodedVDS>({
    queryKey: queryKeys.decode(vdsNo),
    queryFn: () => api.decodeVDS(vdsNo),
    enabled: enabled && vdsNo.length >= 5,
    staleTime: Infinity, // Decoding is deterministic
    retry: false,
  });
}

export function useValidateVDS(vdsNo: string, enabled = true) {
  return useQuery<ValidationResult>({
    queryKey: queryKeys.validate(vdsNo),
    queryFn: () => api.validateVDS(vdsNo),
    enabled: enabled && vdsNo.length >= 5,
    staleTime: Infinity,
    retry: false,
  });
}

// === Datasheet Generation ===

export function useDatasheet(vdsNo: string, enabled = true) {
  return useQuery<DatasheetResponse>({
    queryKey: queryKeys.datasheet(vdsNo),
    queryFn: () => api.generateDatasheet(vdsNo),
    enabled: enabled && vdsNo.length >= 5,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export function useFlatDatasheet(vdsNo: string, enabled = true) {
  return useQuery<FlatDatasheetResponse>({
    queryKey: queryKeys.datasheetFlat(vdsNo),
    queryFn: () => api.generateFlatDatasheet(vdsNo),
    enabled: enabled && vdsNo.length >= 5,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// === Mutations ===

export function useGenerateDatasheetMutation() {
  const queryClient = useQueryClient();

  return useMutation<DatasheetResponse, Error, string>({
    mutationFn: api.generateDatasheet,
    onSuccess: (data, vdsNo) => {
      queryClient.setQueryData(queryKeys.datasheet(vdsNo), data);
    },
  });
}

export function useGenerateBatchMutation() {
  return useMutation<BatchResponse, Error, string[]>({
    mutationFn: api.generateBatch,
  });
}

export function useDecodeVDSMutation() {
  const queryClient = useQueryClient();

  return useMutation<DecodedVDS, Error, string>({
    mutationFn: api.decodeVDS,
    onSuccess: (data, vdsNo) => {
      queryClient.setQueryData(queryKeys.decode(vdsNo), data);
    },
  });
}

// === Utility Hook ===

/**
 * Combined hook for VDS input with validation and decoding
 */
export function useVDSInput(vdsNo: string) {
  const validation = useValidateVDS(vdsNo);
  const decoded = useDecodeVDS(vdsNo, validation.data?.is_valid ?? false);

  return {
    isValidating: validation.isLoading,
    isDecoding: decoded.isLoading,
    isValid: validation.data?.is_valid ?? false,
    validationError: validation.data?.error ?? null,
    decoded: decoded.data,
    error: validation.error || decoded.error,
  };
}
