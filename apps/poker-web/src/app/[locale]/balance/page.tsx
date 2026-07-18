import {
  BalanceModeContent as PointsBalanceModeContent,
  PointsPage as PointsModePage,
} from "@/modes/runtime-entry";
import {
  BalanceModeContent as Web3BalanceModeContent,
  PointsPage as Web3ModePage,
} from "@/modes/web3-entry";

const web3 = process.env.APP_MODE === "web3";

export default function BalancePage() {
  const BalanceModeContent = web3
    ? Web3BalanceModeContent
    : PointsBalanceModeContent;
  const PointsPage = web3 ? Web3ModePage : PointsModePage;
  return (
    <PointsPage>
      <BalanceModeContent />
    </PointsPage>
  );
}
