import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import 'package:spa_shared/widgets/error_widget.dart';
import 'package:spa_shared/utils/date_utils.dart';
import '../../bloc/dashboard/dashboard_bloc.dart';
import '../../bloc/dashboard/dashboard_event.dart';
import '../../bloc/dashboard/dashboard_state.dart';
import '../../widgets/stat_card.dart';
import '../../widgets/customer_segment_card.dart';
import '../../widgets/appointment_stat.dart';
import '../../widgets/quick_action.dart';
import '../../widgets/revenue_chart.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with AutomaticKeepAliveClientMixin, WidgetsBindingObserver {
  String _selectedPeriod = 'month';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadData();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadData();
    }
  }

  void _loadData() {
    context.read<DashboardBloc>().add(const LoadDashboardEvent());
  }

  void _refreshData() {
    _loadData();
  }

  void _navigateToBooking() {
    // Switch to booking tab
    final mainShellState = context.findAncestorStateOfType<_MainShellState>();
    if (mainShellState != null) {
      mainShellState.setTab(2);
    }
  }

  void _navigateToPos() {
    final mainShellState = context.findAncestorStateOfType<_MainShellState>();
    if (mainShellState != null) {
      mainShellState.setTab(3);
    }
  }

  void _navigateToCrm() {
    final mainShellState = context.findAncestorStateOfType<_MainShellState>();
    if (mainShellState != null) {
      mainShellState.setTab(1);
    }
  }

  void _navigateToAi() {
    final mainShellState = context.findAncestorStateOfType<_MainShellState>();
    if (mainShellState != null) {
      mainShellState.setTab(4);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'AI Spa Enterprise',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => _navigateToNotifications(context),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => _navigateToSettings(context),
          ),
        ],
      ),
      body: BlocConsumer<DashboardBloc, DashboardState>(
        listener: (context, state) {
          if (state is DashboardError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is DashboardLoading && state.isInitial) {
            return const Center(
              child: LoadingWidget(
                message: 'Đang tải dữ liệu...',
              ),
            );
          }

          if (state is DashboardError && state.isInitial) {
            return Center(
              child: CustomErrorWidget(
                message: state.message,
                onRetry: _refreshData,
              ),
            );
          }

          final data = state is DashboardLoaded ? state.data : null;

          return RefreshIndicator(
            onRefresh: _refreshData,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Revenue Cards
                  _buildRevenueSection(data),
                  const SizedBox(height: 24),

                  // Revenue Chart
                  _buildRevenueChart(data),
                  const SizedBox(height: 24),

                  // KPI
                  _buildKpiSection(data),
                  const SizedBox(height: 24),

                  // Customer Segments
                  _buildCustomerSection(data),
                  const SizedBox(height: 24),

                  // Today's Appointments
                  _buildAppointmentSection(data),
                  const SizedBox(height: 24),

                  // Quick Actions
                  _buildQuickActions(),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildRevenueSection(dynamic data) {
    final todayRevenue = data?.revenue?.today ?? 0;
    final weekRevenue = data?.revenue?.week ?? 0;
    final monthRevenue = data?.revenue?.month ?? 0;
    final yearRevenue = data?.revenue?.year ?? 0;
    final todayGrowth = data?.revenue?.todayGrowth ?? 0;
    final monthGrowth = data?.revenue?.monthGrowth ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Doanh thu',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            _buildPeriodSelector(),
          ],
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.4,
          children: [
            StatCard(
              title: 'Hôm nay',
              value: AppFormatters.currency(todayRevenue),
              icon: Icons.today,
              color: AppColors.primary,
              growth: todayGrowth,
            ),
            StatCard(
              title: 'Tuần này',
              value: AppFormatters.currency(weekRevenue),
              icon: Icons.date_range,
              color: AppColors.info,
            ),
            StatCard(
              title: 'Tháng này',
              value: AppFormatters.currency(monthRevenue),
              icon: Icons.calendar_month,
              color: AppColors.success,
              growth: monthGrowth,
            ),
            StatCard(
              title: 'Năm nay',
              value: AppFormatters.currency(yearRevenue),
              icon: Icons.analytics,
              color: AppColors.accent,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRevenueChart(dynamic data) {
    final chartData = data?.revenueData ?? <double>[];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Biểu đồ doanh thu',
                style: GoogleFonts.inter(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                '7 ngày qua',
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 200,
            child: chartData.isEmpty
                ? const Center(
                    child: Text('Chưa có dữ liệu'),
                  )
                : RevenueChart(
                    data: chartData,
                    color: AppColors.primary,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildKpiSection(dynamic data) {
    final avgTicket = data?.kpi?.avgTicket ?? 0;
    final retention = data?.kpi?.customerRetention ?? 0;
    final bookingRate = data?.kpi?.bookingRate ?? 0;
    final staffUtilization = data?.kpi?.staffUtilization ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'KPI',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.6,
          children: [
            StatCard(
              title: 'Ticket trung bình',
              value: AppFormatters.currency(avgTicket),
              icon: Icons.receipt_long,
              color: AppColors.primary,
            ),
            StatCard(
              title: 'Tỷ lệ giữ chân',
              value: '${retention.toStringAsFixed(1)}%',
              icon: Icons.refresh,
              color: AppColors.success,
            ),
            StatCard(
              title: 'Tỷ lệ booking',
              value: '${bookingRate.toStringAsFixed(1)}%',
              icon: Icons.event_available,
              color: AppColors.info,
            ),
            StatCard(
              title: 'Hiệu suất NV',
              value: '${staffUtilization.toStringAsFixed(1)}%',
              icon: Icons.person_pin,
              color: AppColors.warning,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCustomerSection(dynamic data) {
    final total = data?.customers?.total ?? 0;
    final newThisMonth = data?.customers?.newThisMonth ?? 0;
    final vip = data?.customers?.vip ?? 0;
    final dormant = data?.customers?.dormant ?? 0;
    final atRisk = data?.customers?.atRisk ?? 0;
    final returning = data?.customers?.returning ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Khách hàng',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            TextButton(
              onPressed: _navigateToCrm,
              child: const Text('Xem tất cả'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
          childAspectRatio: 1.0,
          children: [
            CustomerSegmentCard(
              label: 'Khách mới',
              value: '$newThisMonth',
              icon: Icons.person_add,
              color: AppColors.success,
            ),
            CustomerSegmentCard(
              label: 'Khách VIP',
              value: '$vip',
              icon: Icons.star,
              color: AppColors.accent,
            ),
            CustomerSegmentCard(
              label: 'Ngủ quên',
              value: '$dormant',
              icon: Icons.bedtime,
              color: AppColors.warning,
            ),
            CustomerSegmentCard(
              label: 'Sắp rời bỏ',
              value: '$atRisk',
              icon: Icons.exit_to_app,
              color: AppColors.error,
            ),
            CustomerSegmentCard(
              label: 'Tổng cộng',
              value: '$total',
              icon: Icons.people,
              color: AppColors.info,
            ),
            CustomerSegmentCard(
              label: 'Quay lại',
              value: '$returning',
              icon: Icons.replay,
              color: AppColors.primary,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildAppointmentSection(dynamic data) {
    final total = data?.appointments?.todayTotal ?? 0;
    final pending = data?.appointments?.todayPending ?? 0;
    final completed = data?.appointments?.todayCompleted ?? 0;
    final cancelled = data?.appointments?.todayCancelled ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Lịch hẹn hôm nay',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            TextButton(
              onPressed: _navigateToBooking,
              child: const Text('Xem tất cả'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.divider, width: 0.5),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              AppointmentStat(
                label: 'Tổng',
                value: '$total',
                color: AppColors.textPrimary,
              ),
              AppointmentStat(
                label: 'Chờ xử lý',
                value: '$pending',
                color: AppColors.warning,
              ),
              AppointmentStat(
                label: 'Hoàn thành',
                value: '$completed',
                color: AppColors.success,
              ),
              AppointmentStat(
                label: 'Đã hủy',
                value: '$cancelled',
                color: AppColors.error,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Thao tác nhanh',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            QuickAction(
              icon: Icons.add_circle,
              label: 'Thêm khách',
              onTap: _navigateToCrm,
              color: AppColors.primary,
            ),
            QuickAction(
              icon: Icons.calendar_today,
              label: 'Đặt lịch',
              onTap: _navigateToBooking,
              color: AppColors.info,
            ),
            QuickAction(
              icon: Icons.point_of_sale,
              label: 'Bán hàng',
              onTap: _navigateToPos,
              color: AppColors.success,
            ),
            QuickAction(
              icon: Icons.inventory,
              label: 'Nhập kho',
              onTap: _navigateToInventory,
              color: AppColors.warning,
            ),
            QuickAction(
              icon: Icons.auto_awesome,
              label: 'AI Tư vấn',
              onTap: _navigateToAi,
              color: const Color(0xFF8B5CF6),
            ),
            QuickAction(
              icon: Icons.campaign,
              label: 'Marketing',
              onTap: _navigateToMarketing,
              color: AppColors.accent,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildPeriodSelector() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          _PeriodButton(
            label: 'Tuần',
            isSelected: _selectedPeriod == 'week',
            onTap: () => setState(() => _selectedPeriod = 'week'),
          ),
          _PeriodButton(
            label: 'Tháng',
            isSelected: _selectedPeriod == 'month',
            onTap: () => setState(() => _selectedPeriod = 'month'),
          ),
          _PeriodButton(
            label: 'Năm',
            isSelected: _selectedPeriod == 'year',
            onTap: () => setState(() => _selectedPeriod = 'year'),
          ),
        ],
      ),
    );
  }

  // ==========================================
  // NAVIGATION METHODS
  // ==========================================

  void _navigateToNotifications(BuildContext context) {
    Navigator.pushNamed(context, '/notifications');
  }

  void _navigateToSettings(BuildContext context) {
    Navigator.pushNamed(context, '/settings');
  }

  void _navigateToInventory() {
    // Navigate to inventory
  }

  void _navigateToMarketing() {
    // Navigate to marketing
  }
}

// ==========================================
// PERIOD BUTTON
// ==========================================
class _PeriodButton extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _PeriodButton({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppColors.textSecondary,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}