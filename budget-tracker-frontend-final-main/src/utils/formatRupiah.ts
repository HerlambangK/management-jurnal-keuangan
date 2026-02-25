const toNumber = (value: number | string): number => {
    if (typeof value === "number") return value;

    let cleaned = value.trim().replace(/[^\d,.-]/g, "");
    if (!cleaned) return NaN;

    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");

    if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) {
            cleaned = cleaned.replace(/\./g, "").replace(",", ".");
        } else {
            cleaned = cleaned.replace(/,/g, "");
        }
    } else if (lastComma !== -1) {
        const parts = cleaned.split(",");
        if (parts.length === 2 && parts[1].length <= 2) {
            cleaned = `${parts[0].replace(/,/g, "")}.${parts[1]}`;
        } else {
            cleaned = cleaned.replace(/,/g, "");
        }
    } else {
        const dotParts = cleaned.split(".");
        if (dotParts.length > 2) {
            cleaned = dotParts.join("");
        }
    }

    return Number(cleaned);
};

export default function formatRupiah(value: number | string | undefined | null) {
    if (value === undefined || value === null || value === "") return "Rp 0";

    const numericValue = toNumber(value);
    if (!Number.isFinite(numericValue)) return "Rp 0";

    const formatted = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(numericValue);

    return formatted.replace(/\u00A0/g, " ");
}
